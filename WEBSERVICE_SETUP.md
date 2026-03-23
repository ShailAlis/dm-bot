# Mesa Web

La rama `Webservice` ya incluye una primera plataforma web usable sobre el mismo motor del bot.

## Requisitos

- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `PORT` o `WEB_PORT`

Telegram y Discord pueden seguir activos, pero la web no depende de ellos.

## Arranque

```bash
npm start
```

Con `PORT` o `WEB_PORT` definido, el proceso levanta:

- `GET /health`
- `GET /`
- `GET /api`
- `GET /api/setup/options`
- `GET /api/donations/links`
- `POST /api/rooms`
- `GET /api/rooms/:roomId/state`
- `GET /api/rooms/:roomId/feed?after=<cursor>`
- `GET /api/rooms/:roomId/players`
- `POST /api/rooms/:roomId/players`
- `POST /api/rooms/:roomId/actions`
- `GET /api/rooms/:roomId/votes/current`
- `POST /api/rooms/:roomId/votes/current/cast`
- `POST /api/rooms/:roomId/votes/current/reset`
- `POST /api/rooms/:roomId/continue`
- `POST /api/rooms/:roomId/follow-up`
- `GET /api/rooms/:roomId/chronicle`
- `POST /webhooks/stripe`
- `POST /webhooks/paypal`

## Flujo recomendado de prueba

1. Abre `http://localhost:<PORT>/`
2. Crea una room indicando el numero de jugadores.
3. Guarda el `roomId` y abre la misma room en otro navegador o ventana si quieres simular mas jugadores.
4. Registra personajes hasta completar el grupo.
5. Comprueba que la aventura arranca sola.
6. Usa el formulario de accion para interactuar con la escena.
7. Si aparece una votacion, vota desde los actores registrados.
8. Usa `Continuar`, `Seguir` y `Resetear votacion` para probar recuperacion de flujo.

## Notas

- La identidad web actual es local al navegador: cada cliente genera un `actorId` y lo guarda en `localStorage`.
- El feed web persiste en base de datos mediante `game_events`.
- La plataforma web usa `scope` con `platform: "web"` y `type: "room"`.
- Para rooms web con `roomId` alfanumerico, el storage genera internamente un `chat_id` bigint estable para no romper el esquema heredado.
