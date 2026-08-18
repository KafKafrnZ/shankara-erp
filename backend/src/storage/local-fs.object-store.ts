import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStore, StoredObject } from './object-store';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LocalFsObjectStore implements ObjectStore {
  private readonly storageDir: string;

  constructor(private configService: ConfigService) {
    this.storageDir = path.resolve(process.cwd(), this.configService.get<string>('STORAGE_DIR') || './var/uploads');
  }

  private getKeyPath(key: string): string {
    return path.join(this.storageDir, key);
  }

  async put(sha256: string, body: NodeJS.ReadableStream | Buffer, contentType: string): Promise<StoredObject> {
    const first2 = sha256.substring(0, 2);
    const next2 = sha256.substring(2, 4);
    const key = `${first2}/${next2}/${sha256}`;
    const fullPath = this.getKeyPath(key);
    
    if (await this.exists(key)) {
      const stats = await fs.promises.stat(fullPath);
      return { key, sha256, bytes: stats.size };
    }

    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(fullPath);
      let bytes = 0;

      writeStream.on('error', (err) => {
        fs.unlink(fullPath, () => {});
        reject(new InternalServerErrorException('Failed to write to local storage'));
      });

      writeStream.on('finish', () => {
        resolve({ key, sha256, bytes });
      });

      if (Buffer.isBuffer(body)) {
        bytes = body.length;
        writeStream.end(body);
      } else {
        body.on('data', (chunk) => {
          bytes += chunk.length;
        });
        body.on('error', (err) => {
          fs.unlink(fullPath, () => {});
          reject(err);
        });
        body.pipe(writeStream);
      }
    });
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    if (!(await this.exists(key))) {
      throw new Error(`Object not found: ${key}`);
    }
    return fs.createReadStream(this.getKeyPath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.getKeyPath(key));
      return true;
    } catch {
      return false;
    }
  }
}
