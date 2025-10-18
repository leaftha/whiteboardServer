import "dotenv/config";
import fastify from "fastify";
import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";

import { makeOrLoadRoom } from "./rooms";
import { loadAsset, storeAsset } from "./assets";
import { unfurl } from "./unfurl";

const PORT = process.env.PORT || 6080;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

const app = fastify();

app.register(cors, {
  origin: "http://localhost:3000",
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});
app.register(websocketPlugin);
app.register(async (app) => {
  // LiveKit 토큰 발급 API
  app.post("/token", async (req, res) => {
    const { roomName, participantName } = req.body as any;

    if (!roomName || !participantName) {
      return res
        .status(400)
        .send({ errorMessage: "roomName and participantName are required" });
    }
    console.log(LIVEKIT_API_KEY);
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantName,
    });
    at.addGrant({ roomJoin: true, room: roomName });
    const token = await at.toJwt();

    res.send({ token });
  });

  // LiveKit Webhook 수신
  const webhookReceiver = new WebhookReceiver(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );
  app.post("/livekit/webhook", async (req, res) => {
    try {
      const event = await webhookReceiver.receive(
        String(req.body),
        req.headers["authorization"] as string
      );
      console.log(event);
    } catch (error) {
      // console.error("Error validating webhook event", error);
    }
    res.status(200).send();
  });

  // WebSocket 연결
  app.get("/connect/:roomId", { websocket: true }, async (socket, req) => {
    const roomId = (req.params as any).roomId;
    const sessionId = (req.query as any)?.["sessionId"];

    try {
      const room = await makeOrLoadRoom(roomId);
      console.log("Room loaded:", roomId);
      room.handleSocketConnect({ sessionId, socket });
      console.log("handleSocketConnect finished");
    } catch (e) {
      console.error("Error in handleSocketConnect:", e);
    }
  });

  // 업로드 기능
  app.addContentTypeParser("*", (_, __, done) => done(null));
  app.put("/uploads/:id", async (req, res) => {
    const id = (req.params as any).id;
    await storeAsset(id, req.raw);
    res.send({ ok: true });
  });
  app.get("/uploads/:id", async (req, res) => {
    const id = (req.params as any).id;
    const data = await loadAsset(id);
    res.send(data);
  });

  // unfurl 기능
  app.get("/unfurl", async (req, res) => {
    const url = (req.query as any).url;
    res.send(await unfurl(url));
  });
});

app.listen({ port: Number(PORT), host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`✅ Unified server started on port ${PORT}`);
});
