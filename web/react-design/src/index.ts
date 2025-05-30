import express, {
  Application,
  NextFunction,
  Request,
  Response,
  Router,
} from "express";
import helmet from "helmet";
import bodyParser from "body-parser";
import webpack from "webpack";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import http from "http";
import https from "https";
import httpCodes from "http-codes";
import { logger } from "./utils/logger";
const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
};

// Probably can just keep this as NODE_ENV
type AppEnvironment = "development" | "production" | "ci";
const APP_ENV: AppEnvironment =
  (process.env.APP_ENV as AppEnvironment) ?? "development";
const isDevelopment: boolean = APP_ENV === "development";
const isProduction: boolean = APP_ENV === "production";
const isCI: boolean = APP_ENV === "ci";

// SSL Configuration
const internalKey: string | undefined = process.env.INTERNAL_KEY;
const internalCert: string | undefined = process.env.INTERNAL_CERT;
let httpsOptions: https.ServerOptions = {};

if (isProduction && internalKey && internalCert) {
  const key: string = internalKey.replace(/\\n/g, "\n");
  const cert: string = internalCert.replace(/\\n/g, "\n");
  httpsOptions = { key, cert };
} else if (isProduction) {
  logger.warn(
    "SSL Key or Certificate not provided for production. HTTPS will not be enabled.",
  );
}

// --- Main Application Router ---
const appRouter: Router = express.Router();

appRouter.use(bodyParser.json({ limit: "5mb" }));
appRouter.use(bodyParser.urlencoded({ extended: true, limit: "5mb" }));

appRouter.use((req: Request, res: Response, next: NextFunction) => {
  const existingId = req.get("X-Request-Id");
  const id = existingId ?? uuidv4();
  res.set("X-Request-Id", id);
  (req as Request & { id: string }).id = id;
  next();
});

appRouter.use(requestLogger);

const apiRoutes: Router = express.Router();
apiRoutes.get("/_version", (req: Request, res: Response) => {
  res.json({
    version: process.env.APP_VERSION ?? "N/A",
    gitHash: process.env.APP_GIT_HASH ?? "N/A",
    environment: APP_ENV,
  });
});

appRouter.use("/api", apiRoutes);

// --- Static Asset Serving & SPA Fallback ---
if (isProduction) {
  const staticPath: string =
    process.env.STATIC_PATH ?? path.join(__dirname, "../build");
  logger.info(`Serving static files from: ${staticPath}`);

  appRouter.use(express.static(staticPath));

  appRouter.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && req.accepts("html")) {
      res.sendFile(path.resolve(staticPath, "index.html"));
    } else {
      next();
    }
  });
}

const serverApp: Application = express();
serverApp.use(
  helmet({
    contentSecurityPolicy: isDevelopment ? false : undefined,
  }),
);

serverApp.get("/health", (req: Request, res: Response) => {
  res.status(httpCodes.OK).send("OK");
});

serverApp.use("/", appRouter);

// --- Webpack Dev Middleware (DEVELOPMENT ONLY) ---
if (isDevelopment) {
  let webpackDevMiddleware: typeof import("webpack-dev-middleware");
  let webpackHotMiddleware: typeof import("webpack-hot-middleware");
  let webpackConfig: webpack.Configuration;

  try {
    // Dynamic imports for development-only dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webpackDevMiddleware = require("webpack-dev-middleware");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webpackHotMiddleware = require("webpack-hot-middleware");
    const webpackConfigPath =
      process.env.WEBPACK_CONFIG_PATH ??
      path.join(__dirname, "../webpack.config.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webpackConfig = require(webpackConfigPath);

    if (!webpackConfig.output?.publicPath) {
      logger.error(
        'Webpack configuration must have "output.publicPath" defined for dev server.',
      );
      process.exit(1);
    }
  } catch (e) {
    logger.error(
      "Webpack dev dependencies or config not found. Make sure to install them for development.",
      e as Error,
    );
    process.exit(1);
  }

  const compiler = webpack(webpackConfig);

  serverApp.use(
    webpackDevMiddleware(compiler, {
      publicPath: webpackConfig.output.publicPath as string, // Already checked for existence
      stats: "errors-warnings",
    }),
  );

  serverApp.use(webpackHotMiddleware(compiler));

  serverApp.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && req.accepts("html")) {
      const filename = path.join(compiler.outputPath, "index.html");
      (compiler.outputFileSystem as typeof import("fs")).readFile(
        filename,
        (err: Error | null, result: Buffer) => {
          if (err) {
            return next(err);
          }
          res.set("content-type", "text/html");
          res.send(result);
          res.end();
        },
      );
    } else {
      next();
    }
  });
}

interface HttpError extends Error {
  status?: number;
}

serverApp.use(
  (err: HttpError, req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error:", err);
    const statusCode = err.status ?? httpCodes.INTERNAL_SERVER_ERROR;
    res.status(statusCode).json({
      error: {
        message:
          isDevelopment && err.message
            ? err.message
            : "An unexpected error occurred.",
        // stack: isDevelopment && err.stack ? err.stack : undefined,
      },
    });
  },
);

const activeConnections = new Set<import("net").Socket>();

const gracefulShutdown = (
  serverInstance: http.Server | https.Server,
  signal: string,
) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  activeConnections.forEach((conn) => conn.destroy());
  logger.info(`Drained ${activeConnections.size} active connections.`);
  activeConnections.clear();

  serverInstance.close((err?: Error) => {
    if (err) {
      logger.error("Error during server close:", err);
      process.exit(1);
    }
    logger.info("HTTP(S) server closed.");
    process.exit(0);
  });

  global.setTimeout(() => {
    logger.warn("Graceful shutdown timeout. Forcing exit.");
    process.exit(1);
  }, 10000); // 10-seconds timeout
};

const startServer = (): void => {
  const PORT: number = parseInt(process.env.PORT ?? "3000", 10);
  const SSL_PORT: number = parseInt(process.env.SSL_PORT ?? "443", 10);

  const httpServer: http.Server = http.createServer(serverApp);

  httpServer.on("connection", (conn: import("net").Socket) => {
    activeConnections.add(conn);
    conn.on("close", () => activeConnections.delete(conn));
  });

  httpServer.listen(PORT, () => {
    logger.info(`HTTP Server running on port ${PORT} in ${APP_ENV} mode.`);
  });

  let httpsServerInstance: https.Server | undefined;
  if (isProduction && httpsOptions.key && httpsOptions.cert) {
    httpsServerInstance = https.createServer(httpsOptions, serverApp);

    httpsServerInstance.on("connection", (conn: import("net").Socket) => {
      activeConnections.add(conn);
      conn.on("close", () => activeConnections.delete(conn));
    });

    httpsServerInstance.listen(SSL_PORT, () => {
      logger.info(
        `HTTPS Server running on port ${SSL_PORT} in ${APP_ENV} mode.`,
      );
    });
  }

  type SignalType = "SIGINT" | "SIGTERM" | "SIGHUP";
  const signals: SignalType[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  signals.forEach((signal) => {
    process.on(signal, () => {
      gracefulShutdown(httpServer, signal);
      if (httpsServerInstance) {
        gracefulShutdown(httpsServerInstance, signal);
      }
    });
  });

  process.on(
    "unhandledRejection",
    (reason: unknown, promise: Promise<unknown>) => {
      logger.error(`Unhandled Rejection at: ${promise}`, reason as Error);
    },
  );
};

if (!isCI) {
  startServer();
}

export default serverApp;
