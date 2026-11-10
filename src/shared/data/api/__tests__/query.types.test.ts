import { expectTypeOf, it } from 'vitest'

import type { ListTopicsQuery } from '../schemas/topics'
import type { ApiQuery } from '../types'

it('retains optional query fields for handlers without inventing queries for other endpoints', () => {
  expectTypeOf<ApiQuery<'/topics', 'GET'>>().toEqualTypeOf<ListTopicsQuery>()
  expectTypeOf<ApiQuery<'/topics', 'POST'>>().toEqualTypeOf<never>()
})
