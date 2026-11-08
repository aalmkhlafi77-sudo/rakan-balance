/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Default category seed only (NO sample financial records)
 * Realistic sample data strictly for the isolated Demo workspace
 */

import type { CategoryModel } from '../domain/types.ts';

export const INITIAL_CATEGORIES: CategoryModel[] = [
  { id: 'cat-friends', name: 'أصدقاء ومعارف', sortOrder: 1 },
  { id: 'cat-business', name: 'عملاء ومشاريع', sortOrder: 2 },
  { id: 'cat-suppliers', name: 'تجار وموردون', sortOrder: 3 },
  { id: 'cat-family', name: 'أهل وأقارب', sortOrder: 4 },
];

