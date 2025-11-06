FROM gcr.io/distroless/nodejs20-debian11

COPY / /opt/app/

WORKDIR /opt/app/packages/delta-net-web-client-example
ENV NODE_ENV=production
CMD [ "./build/server/index.js" ]
