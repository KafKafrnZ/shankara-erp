import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MetaService {
  constructor(private readonly dataSource: DataSource) {}

  async getAsOf(user: any) {
    let query = `SELECT MAX(published_at) as "asOf", MAX(id) as "batchId" FROM ingest_batch WHERE status = 'published'`;
    const params: unknown[] = [];
    if (user.role === 'branch') {
      query += ` AND company_id = $1`;
      params.push(user.companyId);
    }
    
    // The max() needs a bit more care to also get the matching batchId.
    // If there's a tie, highest ID wins.
    let fullQuery = `
      SELECT published_at as "asOf", id as "batchId"
      FROM ingest_batch
      WHERE status = 'published'
    `;
    if (user.role === 'branch') {
      fullQuery += ` AND company_id = $1`;
    }
    fullQuery += ` ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1`;
    
    const res = await this.dataSource.query(fullQuery, params);
    if (res.length === 0) {
      return { asOf: null, batchId: null };
    }
    return {
      asOf: res[0].asOf ? new Date(res[0].asOf).toISOString() : null,
      batchId: Number(res[0].batchId),
    };
  }
}
