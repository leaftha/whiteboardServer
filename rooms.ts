import { RoomSnapshot, TLSocketRoom } from "@tldraw/sync-core";
import * as admin from "firebase-admin";

// Firebase Admin SDK 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      require("../whiteboard-374db-firebase-adminsdk-fbsvc-33d66f4d2c.json")
    ),
    storageBucket: "whiteboard-374db.firebasestorage.app",
  });
}

const bucket = admin.storage().bucket();

async function readSnapshotIfExists(
  roomId: string
): Promise<RoomSnapshot | undefined> {
  try {
    const file = bucket.file(`rooms/${roomId}`);
    const [exists] = await file.exists();

    if (!exists) {
      return undefined;
    }

    const [buffer] = await file.download();
    const data = buffer.toString("utf8");
    return JSON.parse(data) as RoomSnapshot;
  } catch (e) {
    console.error("Error reading snapshot from Firebase Storage:", e);
    return undefined;
  }
}

async function saveSnapshot(roomId: string, snapshot: RoomSnapshot) {
  try {
    const data = JSON.stringify(snapshot);
    await bucket.file(`rooms/${roomId}`).save(data, {
      contentType: "application/octet-stream",
    });
    console.log(`Snapshot saved to Firebase Storage: rooms/${roomId}`);
  } catch (e) {
    console.error("Error saving snapshot to Firebase Storage:", e);
  }
}

// 이하 코드는 동일
interface RoomState {
  room: TLSocketRoom<any, void>;
  id: string;
  needsPersist: boolean;
}
const rooms = new Map<string, RoomState>();

// A very simple mutex using promise chaining, avoids race conditions when loading rooms.
// In a production environment you would want one mutex per room to avoid unnecessary blocking.
let mutex = Promise.resolve<null | Error>(null);

export async function makeOrLoadRoom(roomId: string) {
  mutex = mutex
    .then(async () => {
      if (rooms.has(roomId)) {
        const roomState = await rooms.get(roomId)!;
        if (!roomState.room.isClosed()) {
          return null; // all good
        }
      }
      console.log("loading room", roomId);
      const initialSnapshot = await readSnapshotIfExists(roomId);

      const roomState: RoomState = {
        needsPersist: false,
        id: roomId,
        room: new TLSocketRoom({
          initialSnapshot,
          onSessionRemoved(room, args) {
            console.log("client disconnected", args.sessionId, roomId);
            if (args.numSessionsRemaining === 0) {
              console.log("closing room", roomId);
              room.close();
            }
          },
          onDataChange() {
            roomState.needsPersist = true;
          },
        }),
      };
      rooms.set(roomId, roomState);
      return null; // all good
    })
    .catch((error) => {
      // return errors as normal values, so the mutex chain doesn't stop
      return error;
    });

  const err = await mutex;
  if (err) throw err;
  return rooms.get(roomId)!.room;
}

// Do persistence regularly.
// In production you'd want a smarter system with throttling.
setInterval(() => {
  for (const roomState of rooms.values()) {
    if (roomState.needsPersist) {
      // persist room
      roomState.needsPersist = false;
      console.log("saving snapshot", roomState.id);
      saveSnapshot(roomState.id, roomState.room.getCurrentSnapshot());
    }
    if (roomState.room.isClosed()) {
      console.log("deleting room", roomState.id);
      rooms.delete(roomState.id);
    }
  }
}, 2000);
