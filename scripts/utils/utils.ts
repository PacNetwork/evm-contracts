import fs from 'fs';
import path from 'path';
import { randomBytes } from "crypto";
import { ethers } from "hardhat";

export function logRecord(logName: string) {
  const logFilePath = path.join(__dirname, logName);
  
  const logDir = path.dirname(logFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  function syncWrite(chunk: string | Uint8Array, encoding: BufferEncoding = 'utf8') {
    try {
      fs.appendFileSync(logFilePath, chunk, { encoding });
      return true;
    } catch (err) {
      console.error('write fail:', err);
      return false;
    }
  }

  function customWrite(
    chunk: string | Uint8Array,
    callback?: (error: Error | null | undefined) => void
  ): boolean;
  function customWrite(
    chunk: string | Uint8Array,
    encoding?: string,
    callback?: (error: Error | null | undefined) => void
  ): boolean;

  function customWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: string | ((error: Error | null | undefined) => void),
    callback?: (error: Error | null | undefined) => void
  ): boolean {
    try {
      let actualEncoding: BufferEncoding = "utf8";
      let actualCallback: ((error: Error | null | undefined) => void) | undefined;

      if (typeof encodingOrCallback === "function") {
        actualCallback = encodingOrCallback;
      } else {
        actualEncoding = (encodingOrCallback as BufferEncoding) || "utf8";
        actualCallback = callback;
      }

      const success = syncWrite(chunk, actualEncoding);
      
      if (actualCallback) {
        actualCallback(success ? null : new Error('write fail'));
      }
      
      return success;
    } catch (err) {
      callback?.(err as Error);
      return false;
    }
  }

  process.stdout.write = customWrite;
  process.stderr.write = customWrite;
  
  return {
    logFilePath,
    cleanup: () => {
    }
  };
}

export function randAddress() {
  return ethers.getAddress("0x" + randomBytes(20).toString("hex"));
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function isEpsilonEqual(
  x: bigint,
  y: bigint,
  epsilon: bigint = ethers.parseEther("0.00000001")
) {
  return abs(x - y) < epsilon;
}
