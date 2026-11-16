// The app tests share one on-device record store (the real singleton). Clears it between tests.
import { db, data } from "../../src/core/index.js";

export async function resetCore() {
  await db.open();
  await db.deleteMany((await db.all()).map((r) => r.pk));
  for (const k of await db.metaKeys("")) await db.delMeta(k);
  await data.hydrate();
}
