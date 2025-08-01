FROM node:20

ENV HTTP_PROXY=http://proxy-dmz.intel.com:912
ENV HTTPS_PROXY=http://proxy-dmz.intel.com:912
ENV NO_PROXY=localhost,127.0.0.0/8,10.0.0.0/8,.intel.com
ENV http_proxy=http://proxy-dmz.intel.com:912
ENV https_proxy=http://proxy-dmz.intel.com:912
ENV no_proxy=localhost,127.0.0.0/8,10.0.0.0/8,.intel.com

WORKDIR /app

#COPY .npmrc .npmrc 

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
