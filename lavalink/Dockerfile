FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Download Lavalink v4 jar
RUN wget -q -O Lavalink.jar \
  https://github.com/lavalink-devs/Lavalink/releases/download/4.0.8/Lavalink.jar

COPY application.yml .

# Plugins are auto-downloaded on first start into this dir
RUN mkdir -p plugins

EXPOSE 2333

# -Xmx256m keeps memory under Fly.io free tier limit
ENTRYPOINT ["java", "-Xmx256m", "-jar", "Lavalink.jar"]
