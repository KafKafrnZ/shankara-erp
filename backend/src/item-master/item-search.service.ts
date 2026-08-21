import { Injectable, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ItemMasterRow } from './entities/item-master-row.entity';
import { ItemMasterBatch } from './entities/item-master-batch.entity';

@Injectable()
export class ItemSearchService {
  constructor(
    @InjectRepository(ItemMasterRow) private rowRepo: Repository<ItemMasterRow>,
  ) {}

  async search(query: { q?: string, mainGroup?: string, subGroup?: string, brand?: string, limit?: number, offset?: number }) {
    const qb = this.rowRepo.createQueryBuilder('row')
      .innerJoin('row.batch', 'batch')
      .where('row.valid_to IS NULL')
      .andWhere('row.is_deleted = false')
      .andWhere("batch.status = 'published'");

    if (query.q) {
      qb.andWhere(new Brackets(sqb => {
        sqb.where('row.item_code ILIKE :q', { q: `%${query.q}%` })
           .orWhere('row.item_name ILIKE :q', { q: `%${query.q}%` })
           .orWhere('row.catalogue_no ILIKE :q', { q: `%${query.q}%` })
           .orWhere('row.brand ILIKE :q', { q: `%${query.q}%` });
      }));
    }

    if (query.mainGroup) {
      qb.andWhere('row.main_group = :mainGroup', { mainGroup: query.mainGroup });
    }
    if (query.subGroup) {
      qb.andWhere('row.sub_group = :subGroup', { subGroup: query.subGroup });
    }
    if (query.brand) {
      qb.andWhere('row.brand = :brand', { brand: query.brand });
    }

    qb.orderBy('row.item_code', 'ASC');

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    qb.take(limit).skip(offset);

    const [hits, total] = await qb.getManyAndCount();

    return { total, hits };
  }

  async getFacets() {
    // Quick grouping for facets
    const qbBase = this.rowRepo.createQueryBuilder('row')
      .innerJoin('row.batch', 'batch')
      .where('row.valid_to IS NULL')
      .andWhere('row.is_deleted = false')
      .andWhere("batch.status = 'published'");
    
    // In a real app we'd do 3 separate count queries or one big facet query
    const mainGroups = await qbBase.clone().select('row.main_group', 'value').addSelect('COUNT(*)', 'count').where('row.main_group IS NOT NULL').groupBy('row.main_group').getRawMany();
    const subGroups = await qbBase.clone().select('row.sub_group', 'value').addSelect('COUNT(*)', 'count').where('row.sub_group IS NOT NULL').groupBy('row.sub_group').getRawMany();
    const brands = await qbBase.clone().select('row.brand', 'value').addSelect('COUNT(*)', 'count').where('row.brand IS NOT NULL').groupBy('row.brand').getRawMany();

    return {
      mainGroup: mainGroups.map(g => ({ value: g.value, count: parseInt(g.count, 10) })),
      subGroup: subGroups.map(g => ({ value: g.value, count: parseInt(g.count, 10) })),
      brand: brands.map(g => ({ value: g.value, count: parseInt(g.count, 10) })),
    };
  }

  async getItemHistory(itemCode: string) {
    return this.rowRepo.find({
      where: { itemCode },
      order: { validFrom: 'DESC' }
    });
  }

  async exportCsv(query: any, res: any) {
    // Streaming CSV output logic could go here
    // Leaving unimplemented for briefness unless greenlit
  }
}
