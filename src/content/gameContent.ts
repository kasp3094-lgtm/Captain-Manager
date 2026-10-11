import balanceData from '../../content/balance.yaml';
import { BalanceSchema, type Balance } from './balance';

/** Content as the game sees it: loaded at build time, checked against its schema at startup. */
export const balance: Balance = BalanceSchema.parse(balanceData);
