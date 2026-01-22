FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["Defender.ChatRoom.csproj", "./"]
RUN dotnet restore "Defender.ChatRoom.csproj"
COPY . .
RUN dotnet build "Defender.ChatRoom.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Defender.ChatRoom.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
COPY appsettings.json .
ENTRYPOINT ["dotnet", "Defender.ChatRoom.dll"]
