import { Controller, Post, UseGuards, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { VOUCHER_INDEX_TOKEN, IndexedVoucher } from './search-index.interface';
import type { VoucherIndex } from './search-index.interface';
import { Voucher } from '../ingest/entities/voucher.entity';
import { getCompanyName } from './company-name';

@Controller('index')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchIndexController {
  constructor(
    @Inject(VOUCHER_INDEX_TOKEN) private readonly indexer: VoucherIndex,
    private readonly dataSource: DataSource
  ) {}

  @Post('reindex')
  @Roles('steward')
  async reindex() {
    const qb = this.dataSource.getRepository(Voucher)
      .createQueryBuilder('v')
      .innerJoin('ingest_batch', 'b', 'b.id = v.batch_id')
      .where('v.valid_to IS NULL')
      .andWhere('v.is_deleted = false')
      .andWhere("b.status = 'published'");

    const sqlCurrent = await qb.getCount();
    
    // We should fetch and format the docs to bulk insert.
    // Given the potentially large size, we might need a stream or large limit, but for this exercise 30k will fit in memory briefly.
    const vouchers = await qb.getMany();

    const docs: IndexedVoucher[] = vouchers.map(v => {
      let vch_date = '';
      if (typeof v.vchDate === 'string') {
        vch_date = v.vchDate;
      } else {
        const d = new Date(v.vchDate as any);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        vch_date = `${yyyy}-${mm}-${dd}`;
      }
      return {
        id: String(v.id),
        company_id: v.companyId,
        company_name: getCompanyName(v.companyId),
        vch_no: v.vchNo || '',
        vch_no_norm: v.vchNoNorm || '',
        party_name: v.partyName,
        total_amount: String(v.totalAmount ?? '0.00'),
        narration: v.narration,
        vch_date,
        vch_type: v.vchType,
        batch_id: String(v.batchId),
      };
    });

    const result = await this.indexer.reindexAll(docs);
    return {
      sqlCurrent,
      indexed: result.indexed,
    };
  }
}
