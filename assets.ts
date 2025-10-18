import { mkdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { Readable } from "stream";
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

export async function storeAsset(id: string, stream: Readable) {
  const file = bucket.file(`img/${id}`);
  const writeStream = file.createWriteStream({
    resumable: false,
    contentType: "auto",
  });

  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream).on("finish", resolve).on("error", reject);
  });
}

export async function loadAsset(id: string) {
  const file = bucket.file(`img/${id}`);
  const [exists] = await file.exists();
  if (!exists) throw new Error("File not found");

  const [buffer] = await file.download();
  return buffer;
}
// assets.ts
export async function deleteAsset(id: string) {
  const file = bucket.file(id);
  const [exists] = await file.exists();
  if (!exists) throw new Error("File not found");
  await file.delete();
}
