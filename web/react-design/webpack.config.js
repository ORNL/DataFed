const webpack = require('webpack');
const path = require('path');

// Builds the index.html file for you in hot reload so that the hashes are correct
const HtmlWebpackPlugin = require('html-webpack-plugin');
// Removes CSS from JS bundle and puts into a styles.css stylesheet that can be cached
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const autoprefixer = require('autoprefixer');

const TerserPlugin = require('terser-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

// Use a generic environment variable name
const envName = process.env.APP_ENV || 'development';
const isLocal = envName === 'development';

const buildPath = isLocal ? path.join(__dirname, 'build/static') : path.join(__dirname, '/build/static');
const imgPath = path.join(__dirname, './src/assets/img'); // Assuming 'app' is your source folder
const sourcePath = path.join(__dirname, './src'); // Assuming 'app' is your source folder
// We need to pass each design system package's node_modules directory to
// node-sass in order for nested package dependencies to work
// See: github.com/webpack-contrib/sass-loader/issues/466
const sassIncludePaths = [path.join(__dirname, 'node_modules')];

// Common plugins
const plugins = [
  new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /(en|es)$/), // Example, remove if not using moment
  new webpack.DefinePlugin({
    'process.env': {
      APP_ENV: JSON.stringify(envName),
      // NODE_ENV is automatically set by webpack based on mode
    },
  }),
  new HtmlWebpackPlugin({
    template: path.join(sourcePath, 'index.html'), // Adjust if your template is different
    path: buildPath,
    filename: 'index.html',
    // tealiumOn: !isLocal, // Example custom option, remove if not needed
  }),
  new webpack.LoaderOptionsPlugin({
    options: {
      postcss: [autoprefixer()],
      context: sourcePath,
    },
  }),
];

// Common rules
const rules = [
  {
    test: /\.(ts|tsx)$/,
    exclude: /node_modules/,
    use: [
      {
        loader: 'babel-loader',
        options: {
          plugins: isLocal ? [require.resolve('react-refresh/babel')] : [],
        },
      },
      {
        loader: 'ts-loader',
        options: {
          transpileOnly: isLocal, // Skip type checking in development for faster builds
        },
      },
    ],
  },
  {
    test: /^(?!.*\.spec\.(js|jsx)$).*\.(js|jsx)$/,
    exclude: /node_modules/,
    use: [
      {
        loader: 'babel-loader',
        options: {
          plugins: isLocal ? [require.resolve('react-refresh/babel')] : [],
        },
      },
    ],
  },
  {
    test: /\.(png|gif|jpg|svg)$/,
    include: imgPath,
    type: 'asset',
    parser: {
      dataUrlCondition: {
        maxSize: 20 * 1024, // 20kb
      },
    },
    generator: {
      filename: 'assets/[name]-[contenthash][ext]',
    },
  },
  {
    test: /\.(png|woff|woff2|eot|ttf|svg)$/,
    type: 'asset/resource',
    generator: {
      filename: 'assets/[name]-[contenthash][ext]',
    },
  },
  {
    test: /\.css$/,
    use: [
      isLocal ? 'style-loader' : MiniCssExtractPlugin.loader,
      'css-loader',
      'postcss-loader',
    ],
  },
];

const entry = {
  main: ['./main.tsx'], // Client-side React entry point
};

if (!isLocal) {
  // Production plugins
  plugins.push(
    new MiniCssExtractPlugin({
      filename: 'style-[contenthash].css',
    })
  );

  // Production rules
  rules.push({
    test: /\.scss$/,
    use: [
      MiniCssExtractPlugin.loader,
      'css-loader',
      { loader: 'postcss-loader', options: {} },
      { loader: 'sass-loader', options: { sassOptions: { includePaths: sassIncludePaths } } },
    ],
  });
} else {
  // Development entry points
  entry.main.push('webpack-hot-middleware/client'); // If using webpack-hot-middleware
  // Development plugins
  plugins.push(new webpack.HotModuleReplacementPlugin());
  plugins.push(new ReactRefreshWebpackPlugin({
    overlay: false, // Disable the error overlay since we're not using webpack-dev-server
  }));

  // Development rules
  rules.push({
    test: /\.scss$/,
    exclude: /node_modules/,
    use: [
      'style-loader',
      'css-loader',
      'postcss-loader',
      {
        loader: 'sass-loader',
        options: {
          sourceMap: true,
          sassOptions: { includePaths: sassIncludePaths },
        },
      },
    ],
  });
}

module.exports = {
  devtool: isLocal ? 'eval-cheap-module-source-map' : 'source-map',
  mode: isLocal ? 'development' : 'production',
  optimization: {
    splitChunks: {
      cacheGroups: {
        defaultVendors: {
          test: /[\\/]node_modules[\\/]/,
          filename: 'vendor-[fullhash].js', // Changed filename for clarity
          name: 'vendor',
          chunks: 'all',
        },
      },
    },
    minimize: !isLocal,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
          mangle: {
            keep_fnames: true, // Consider if this is always needed
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
    moduleIds: 'named', // 'deterministic' is often preferred for long-term caching
  },
  context: sourcePath, // Assuming 'app' is your source folder (e.g., where index.ts is)
  entry,
  output: {
    path: buildPath,
    publicPath: '/static/', // Generic public path, adjust to your server setup
    filename: '[name]-[fullhash].js', // Use [name] to reflect entry point names
  },
  module: {
    rules,
  },
  resolve: {
    fallback: {
      url: require.resolve('url'), // If you use the 'url' polyfill
    },
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'], // Added .ts and .tsx for TypeScript
    modules: ['node_modules', sourcePath], // Allow imports relative to sourcePath
  },
  plugins: plugins,
  devServer: {
    static: { // Updated for webpack-dev-server v4+
      directory: isLocal ? sourcePath : buildPath,
    },
    historyApiFallback: true,
    port: 3000,
    compress: !isLocal,
    hot: isLocal,
    host: '0.0.0.0',
    client: { // Added client configuration for HMR
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    devMiddleware: { // Standard way to define publicPath for devServer
      publicPath: '/static/', // Should match output.publicPath
    },
    stats: { // Deprecated, use infrastructureLogging in webpack-dev-server v4+ for similar control
      assets: true,
      children: false,
      chunks: false,
      hash: false,
      modules: false,
      publicPath: false,
      timings: true,
      version: false,
      warnings: true,
      colors: {
        green: '\u001b[32m',
      },
    },
  },
};