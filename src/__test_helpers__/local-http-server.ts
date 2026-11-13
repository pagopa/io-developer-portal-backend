import { EventEmitter } from "events";
import { createServer, RequestListener } from "http";
import { Socket } from "net";

export const withLocalHttpServer = async <T>(
  handler: RequestListener,
  run: (baseUrl: string) => Promise<T>
): Promise<T> => {
  const server = createServer(handler);
  const sockets = new Set<Socket>();
  server.on("connection", socket => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Local server did not expose a TCP address");
    }
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
};

export const waitForEvent = (
  emitter: EventEmitter,
  event: string
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onEvent = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      emitter.removeListener(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 2000);
    emitter.once(event, onEvent);
  });
