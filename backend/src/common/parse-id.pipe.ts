import { ParseIntPipe, NotFoundException } from '@nestjs/common';

/**
 * For :id route params that are database ids.
 *
 * Without this, a non-numeric id (a typo, a stale bookmark, a truncated
 * link) flowed straight into `Number(id)` -> NaN -> the query layer, and
 * Postgres rejected it with `invalid input syntax for type bigint: "NaN"`,
 * which surfaced to the user as a bare 500 "Internal server error".
 *
 * A route param that isn't a number simply cannot identify a record, so
 * this reports it the same way a real miss is reported: 404.
 */
export const ParseIdPipe = new ParseIntPipe({
  exceptionFactory: () => new NotFoundException(),
});
