import { SearchService } from './search.service';

describe('SearchService vch_no_norm binds', () => {
  it('ranks exact vch_no_norm on a separate bind from the LIKE prefix', async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const dataSource = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: [...(params ?? [])] });
        if (/COUNT/i.test(sql)) return [{ total: 0 }];
        return [];
      }),
    };
    const indexer = { searchCandidates: jest.fn().mockRejectedValue(new Error('no OS')) };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new SearchService(dataSource as any, auditService as any, indexer as any);

    await service.search(
      { q: 'INV/SR/1', limit: 20, offset: 0 },
      { role: 'finance', id: 1 },
    );

    const count = queries.find((q) => /COUNT/i.test(q.sql));
    const data = queries.find((q) => q.sql.includes('ORDER BY'));
    expect(count).toBeDefined();
    expect(data).toBeDefined();
    expect(count!.sql).not.toMatch(/vch_no_norm = \$/);
    expect(count!.params).toContain('invsr1%');
    expect(count!.params).not.toContain('invsr1');
    const like = data!.sql.match(/vch_no_norm LIKE \$(\d+)/);
    const exact = data!.sql.match(/vch_no_norm = \$(\d+)/);
    expect(like).not.toBeNull();
    expect(exact).not.toBeNull();
    expect(like![1]).not.toBe(exact![1]);
    expect(data!.params).toContain('invsr1%');
    expect(data!.params).toContain('invsr1');
  });

  it('falls back to searchSql if OS throws', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ total: 0 }]) };
    const indexer = { searchCandidates: jest.fn().mockRejectedValue(new Error('no OS')) };
    const auditService = { log: jest.fn() };
    const service = new SearchService(dataSource as any, auditService as any, indexer as any);
    
    await service.search({ q: 'TEST' }, { role: 'finance', id: 1 });
    expect(indexer.searchCandidates).toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledTimes(3); // count, query, asOf
  });

  it('intersects numeric OS ids with bound IN list and drops non-numeric _ids', async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const dataSource = { query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: [...(params ?? [])] });
      if (/COUNT/i.test(sql)) return [{ total: 1 }];
      if (/MAX\(published_at\)/i.test(sql)) return [{ asOf: null }];
      return [];
    }) };
    const indexer = {
      searchCandidates: jest.fn().mockResolvedValue({ ids: ['10', 's19stale', '20'], tookMs: 1 }),
    };
    const auditService = { log: jest.fn() };
    const service = new SearchService(dataSource as any, auditService as any, indexer as any);

    await service.search({ q: 'TEST' }, { role: 'finance', id: 1 });

    const count = queries.find((q) => /COUNT/i.test(q.sql));
    expect(count!.sql).toMatch(/voucher\.id IN \(\$\d+, \$\d+\)/);
    expect(count!.sql).not.toMatch(/bigint\[\]/);
    expect(count!.params).toEqual(expect.arrayContaining(['10', '20']));
    expect(count!.params).not.toContain('s19stale');
  });

  it('escapes LIKE wildcards in the user query so % is literal', async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const dataSource = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: [...(params ?? [])] });
        if (/COUNT/i.test(sql)) return [{ total: 0 }];
        return [];
      }),
    };
    const indexer = { searchCandidates: jest.fn().mockRejectedValue(new Error('no OS')) };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new SearchService(dataSource as any, auditService as any, indexer as any);

    await service.search({ q: '100%', limit: 20, offset: 0 }, { role: 'finance', id: 1 });

    const count = queries.find((q) => /COUNT/i.test(q.sql));
    expect(count!.params).toContain('%100\\%%');
    expect(count!.params).not.toContain('%100%%');
    expect(count!.sql).toMatch(/ESCAPE '\\'/);
  });

  it('falls back to SQL when OS returns no numeric ids, instead of a fake empty result', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ total: 0 }]) };
    const indexer = {
      searchCandidates: jest.fn().mockResolvedValue({ ids: ['s19stale'], tookMs: 1 }),
    };
    const auditService = { log: jest.fn() };
    const service = new SearchService(dataSource as any, auditService as any, indexer as any);

    await service.search({ q: 'S19STALE/1' }, { role: 'finance', id: 1 });
    expect(dataSource.query).toHaveBeenCalledTimes(3);
  });
});
