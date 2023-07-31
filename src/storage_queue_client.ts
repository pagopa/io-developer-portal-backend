import * as AzureStorage from "azure-storage";
import { logger } from "./logger";

export interface IStorageQueueClient {
  readonly insertNewMessage: (obj: unknown) => void;
}

export function StorageQueueClient(
  storageQueueService: AzureStorage.QueueService,
  queueName: string
): IStorageQueueClient {
  const encodeToBase64 = (content: unknown): string => {
    const jsonString = JSON.stringify(content);
    const buffer = Buffer.from(jsonString, "utf-8");
    return buffer.toString("base64");
  };

  const insertNewMessage: (content: unknown) => void = content => {
    storageQueueService.createMessage(
      queueName,
      encodeToBase64(content),
      error => {
        if (error) {
          logger.error(
            `An Error has occurred while writing message on queue: ${queueName}, content: ${content}, the cause was: ${error.message}`
          );
        }
      }
    );
  };

  return {
    insertNewMessage
  };
}
