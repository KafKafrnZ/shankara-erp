import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { VoucherIndex, IndexedVoucher } from './search-index.interface';

import { parseIndianAmount } from '../ingest/parse/amount';
import { normalizeVchNo } from '../ingest/parse/vch-no';

@Injectable()
export class OpensearchAdapter implements VoucherIndex {
  private readonly client: Client;
  private readonly indexName = 'shankara-vouchers';
  private readonly logger = new Logger(OpensearchAdapter.name);
  private initialized = false;

  constructor(nodeUrl: string) {
    this.client = new Client({ node: nodeUrl });
  }

  private async ensureIndex() {
    if (this.initialized) return;
    try {
      const { body: exists } = await this.client.indices.exists({ index: this.indexName });
      if (!exists) {
        await this.createIndex();
      } else {
        // Ensure company_name exists on existing index
        await this.client.indices.putMapping({
          index: this.indexName,
          body: {
            properties: {
              company_name: { type: 'text' }
            }
          }
        });
      }
      this.initialized = true;
    } catch (err) {
      this.logger.error(`Failed to ensure index: ${err}`);
    }
  }

  private async createIndex() {
    await this.client.indices.create({
      index: this.indexName,
      body: {
        mappings: {
          properties: {
            company_id: { type: 'keyword' },
            company_name: { type: 'text' },
            vch_no: { type: 'keyword' },
            vch_no_norm: { type: 'keyword' },
            party_name: {
              type: 'text',
              fields: {
                raw: { type: 'keyword' }
              }
            },
            total_amount: { type: 'keyword' },
            narration: { type: 'text' },
            vch_date: { type: 'date', format: 'yyyy-MM-dd' },
            vch_type: { type: 'keyword' },
            batch_id: { type: 'keyword' }
          }
        }
      }
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (e) {
      return false;
    }
  }

  async upsert(docs: IndexedVoucher[]): Promise<void> {
    if (!docs.length) return;
    await this.ensureIndex();
    
    const body: any[] = [];
    for (const doc of docs) {
      body.push({ index: { _index: this.indexName, _id: doc.id } });
      const { id, ...rest } = doc;
      body.push(rest);
    }
    
    try {
      await this.client.bulk({ refresh: true, body });
    } catch (err) {
      this.logger.error(`Bulk upsert failed: ${err}`);
      throw err;
    }
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.ensureIndex();

    const body: any[] = [];
    for (const id of ids) {
      body.push({ delete: { _index: this.indexName, _id: id } });
    }

    try {
      await this.client.bulk({ refresh: true, body });
    } catch (err) {
      this.logger.error(`Bulk delete failed: ${err}`);
      throw err;
    }
  }

  async deleteByBatchId(batchId: string): Promise<void> {
    await this.ensureIndex();
    try {
      await this.client.deleteByQuery({
        index: this.indexName,
        refresh: true,
        body: {
          query: {
            term: { batch_id: batchId }
          }
        }
      });
    } catch (err) {
      this.logger.error(`Delete by batchId failed: ${err}`);
      throw err;
    }
  }

  async reindexAll(docs: IndexedVoucher[]): Promise<{ indexed: number }> {
    try {
      await this.ensureIndex();

      let indexed = 0;
      const CHUNK_SIZE = 500;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const body: any[] = [];
        for (const doc of chunk) {
          body.push({ index: { _index: this.indexName, _id: doc.id } });
          const { id, ...rest } = doc;
          body.push(rest);
        }
        const { body: bulkResponse } = await this.client.bulk({ refresh: true, body });
        if (bulkResponse.errors) {
          this.logger.error('Errors occurred during bulk index');
        }
        indexed += chunk.length;
      }

      const allIds = docs.map(d => d.id);
      
      if (allIds.length > 0) {
        await this.client.deleteByQuery({
          index: this.indexName,
          refresh: true,
          body: {
            query: {
              bool: {
                must_not: {
                  ids: {
                    values: allIds
                  }
                }
              }
            }
          }
        });
      } else {
        await this.client.deleteByQuery({
          index: this.indexName,
          refresh: true,
          body: {
            query: {
              match_all: {}
            }
          }
        });
      }

      return { indexed };
    } catch (err) {
      this.logger.error(`reindexAll failed: ${err}`);
      throw err;
    }
  }

  async searchCandidates(q: string, opts: { size: number }): Promise<{ ids: string[]; tookMs: number }> {
    const start = Date.now();
    try {
      const norm = normalizeVchNo(q);
      const amt = parseIndianAmount(q);
      
      const should: any[] = [];
      
      if (norm.length > 0) {
        should.push({ term: { vch_no_norm: { value: norm, boost: 5 } } });
        should.push({ prefix: { vch_no_norm: { value: norm, boost: 2 } } });
      }
      
      if (amt !== null) {
        should.push({ term: { total_amount: amt } });
        should.push({ term: { vch_no: q } });
      } else {
        should.push({ term: { vch_no: q } });
      }
      
      should.push({ match: { party_name: q } });
      should.push({ match: { narration: q } });
      
      should.push({ match: { party_name: { query: q, fuzziness: 1, prefix_length: 1 } } });
      should.push({ match: { company_name: { query: q, fuzziness: 1, prefix_length: 1 } } });

      const res = await this.client.search({
        index: this.indexName,
        size: opts.size || 50,
        timeout: '500ms',
        body: {
          query: {
            bool: {
              should,
              minimum_should_match: 1
            }
          }
        }
      }, { requestTimeout: 500 });
      
      const hits = res.body.hits?.hits || [];
      const ids = hits.map((h: any) => h._id);
      return { ids, tookMs: Date.now() - start };
    } catch (err) {
      this.logger.error(`searchCandidates failed: ${err}`);
      throw err;
    }
  }
}
