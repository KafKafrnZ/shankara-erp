import { Test, TestingModule } from '@nestjs/testing';
import { OpensearchAdapter } from './opensearch.adapter';
import { Client } from '@opensearch-project/opensearch';

jest.mock('@opensearch-project/opensearch', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        ping: jest.fn(),
        indices: {
          exists: jest.fn().mockResolvedValue({ body: true }),
          create: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
          putMapping: jest.fn().mockResolvedValue({}),
        },
        bulk: jest.fn().mockResolvedValue({ body: { errors: false, items: [] } }),
        deleteByQuery: jest.fn().mockResolvedValue({ body: {} }),
        search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
      };
    }),
  };
});

describe('OpensearchAdapter', () => {
  let adapter: OpensearchAdapter;
  let clientMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: OpensearchAdapter,
          useFactory: () => new OpensearchAdapter('http://localhost:9200'),
        },
      ],
    }).compile();

    adapter = module.get<OpensearchAdapter>(OpensearchAdapter);
    // Access the mocked client internally created by the adapter
    clientMock = (adapter as any).client;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should map document correctly and use voucher id as _id', async () => {
    const docs = [
      {
        id: '1001',
        company_id: 'TEST_CO',
        vch_no: 'TEST/1',
        vch_no_norm: 'test1',
        company_name: 'TEST_CO',
        party_name: 'Test Party',
        total_amount: '123.45', // String amount
        narration: 'Test',
        vch_date: '2025-04-01',
        vch_type: 'Sales',
        batch_id: '99',
      }
    ];

    await adapter.upsert(docs);

    expect(clientMock.bulk).toHaveBeenCalledTimes(1);
    const bulkArgs = clientMock.bulk.mock.calls[0][0];
    expect(bulkArgs.body[0]).toEqual({ index: { _index: 'shankara-vouchers', _id: '1001' } });
    expect(bulkArgs.body[1]).toEqual({
      company_id: 'TEST_CO',
      company_name: 'TEST_CO',
      vch_no: 'TEST/1',
      vch_no_norm: 'test1',
      party_name: 'Test Party',
      total_amount: '123.45',
      narration: 'Test',
      vch_date: '2025-04-01',
      vch_type: 'Sales',
      batch_id: '99',
    });
  });

  it('should not delete the index during reindexAll', async () => {
    const docs = [
      {
        id: '1002',
        company_id: 'TEST_CO',
        vch_no: 'TEST/2',
        vch_no_norm: 'test2',
        company_name: 'TEST_CO',
        party_name: 'Test Party',
        total_amount: '500.00',
        narration: 'Test',
        vch_date: '2025-04-01',
        vch_type: 'Sales',
        batch_id: '100',
      }
    ];

    await adapter.reindexAll(docs);
    expect(clientMock.indices.delete).not.toHaveBeenCalled();
    expect(clientMock.bulk).toHaveBeenCalledTimes(1);
    expect(clientMock.deleteByQuery).toHaveBeenCalledTimes(1);
  });

  it('applies fuzziness only on party_name and company_name, not vch_no_norm', async () => {
    await adapter.searchCandidates('shankra', { size: 50 });
    expect(clientMock.search).toHaveBeenCalled();
    const body = clientMock.search.mock.calls[0][0].body;
    const should = JSON.stringify(body.query.bool.should);
    expect(should).toContain('"fuzziness":1');
    expect(should).toMatch(/party_name/);
    expect(should).toMatch(/company_name/);
    const vchClauses = body.query.bool.should.filter(
      (c: any) => c.term?.vch_no_norm || c.prefix?.vch_no_norm || c.term?.vch_no || c.term?.total_amount,
    );
    expect(JSON.stringify(vchClauses)).not.toContain('fuzziness');
  });
});
