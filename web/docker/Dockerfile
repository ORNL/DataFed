# syntax=docker/dockerfile:1
#FROM ubuntu as sdms
FROM node:16-alpine as datafed_ws

EXPOSE 443

#RUN mkdir -p /app/node_modules

RUN mkdir -p /opt/datafed_ws/node_modules && chown -R node:node /opt/datafed_ws

WORKDIR /opt/datafed_ws

USER node

COPY --chown=node:node package.json package-lock.json* ./
ENV PATH /opt/datafed_ws/node_modules/.bin:$PATH

#RUN apt update
#RUN apt install nodejs -y
#RUN apt install npm -y

#RUN npm install --no-optional && npm cache clean --force

RUN npm install express
RUN npm install express-session
RUN npm install cookie parser
RUN npm install helmet
RUN npm install protobufjs
RUN npm install zeromq@5.2.0
RUN npm install ect
RUN npm install client-oauth2


COPY --chown=node:node . .

#VOLUME /app

CMD datafed-ws.js datafed-ws.ini
