using System.Collections.Generic;
using System.Net.WebSockets;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Defender.ChatRoom.Services;

namespace Defender.ChatRoom;

class Program
{
    static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Configuration
            .SetBasePath(builder.Environment.ContentRootPath)
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
            .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
            .AddEnvironmentVariables()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Room:Passphrase", Environment.GetEnvironmentVariable("ROOM_PASSPHRASE") },
                { "Room:InactivityMinutes", Environment.GetEnvironmentVariable("INACTIVITY_MINUTES") ?? "15" },
                { "Room:HeartbeatSeconds", Environment.GetEnvironmentVariable("HEARTBEAT_SECONDS") ?? "30" }
            });

        builder.Services.Configure<RoomOptions>(
            builder.Configuration.GetSection(RoomOptions.SectionName));

        builder.Services.AddSingleton<RoomService>();
        builder.Services.AddSingleton<WebSocketConnectionService>();
        builder.Services.AddSingleton<ChallengeService>();
        builder.Services.AddSingleton<CryptographyService>();
        builder.Services.AddSingleton<WebSocketMessageService>();
        builder.Services.AddSingleton<BroadcastService>();
        builder.Services.AddScoped<SignalingService>();
        builder.Services.AddScoped<WebSocketHandlerService>();
        builder.Services.AddScoped<RoomResetHandler>();

        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        var app = builder.Build();

        app.UseCors();
        app.UseWebSockets();

        app.Map("/ws", async (HttpContext context) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                return Results.BadRequest("WebSocket connection required");
            }

            var connectionService = context.RequestServices.GetRequiredService<WebSocketConnectionService>();
            var signalingService = context.RequestServices.GetRequiredService<SignalingService>();
            var handlerService = context.RequestServices.GetRequiredService<WebSocketHandlerService>();
            var roomService = context.RequestServices.GetRequiredService<RoomService>();
            var messageService = context.RequestServices.GetRequiredService<WebSocketMessageService>();

            var clientId = context.Request.Query["clientId"].ToString();
            if (string.IsNullOrEmpty(clientId))
            {
                clientId = Guid.NewGuid().ToString();
            }

            var existingConnection = connectionService.GetConnection(clientId);
            if (existingConnection != null && existingConnection.State == WebSocketState.Open)
            {
                Console.WriteLine($"Replacing existing connection for client ID: {clientId}");
                try
                {
                    await existingConnection.CloseAsync(WebSocketCloseStatus.NormalClosure, "Replaced by new connection", CancellationToken.None);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] Error closing existing connection - ClientId: {clientId}, Error: {ex.Message}");
                }
                finally
                {
                    handlerService.CleanupConnection(clientId);
                }
            }

            var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var userAgent = context.Request.Headers["User-Agent"].ToString();
            
            Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] WebSocket connection attempt - ClientId: {clientId}, RemoteIP: {remoteIp}, UserAgent: {userAgent}");
            
            var ws = await context.WebSockets.AcceptWebSocketAsync();
            connectionService.AddConnection(clientId, ws);
            
            var activeConnections = connectionService.GetAllConnections().Count;
            Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] WebSocket connected - ClientId: {clientId}, RemoteIP: {remoteIp}, State: {ws.State}, TotalActiveConnections: {activeConnections}");

            await signalingService.SendChallengeAsync(clientId, ws);

            try
            {
                await handlerService.HandleWebSocketAsync(clientId, ws);
            }
            finally
            {
                handlerService.CleanupConnection(clientId);
            }

            return Results.Empty;
        });

        app.MapMethods("/reset", new[] { "GET", "POST" }, async (HttpContext context) =>
        {
            var handler = context.RequestServices.GetRequiredService<RoomResetHandler>();
            return await handler.HandleAsync(context);
        });

        await app.RunAsync();
    }
}
