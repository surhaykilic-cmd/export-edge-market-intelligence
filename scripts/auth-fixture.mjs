// Synthetic credentials for local authorization fixtures only; never production values.
import {createHash} from 'node:crypto';

export const TEST_OWNER_EMAIL='fixture-owner@example.test';
export const TEST_SERVICE_TOKEN='test-only-service-token-for-public-sharing-fixtures';
export const OWNER_HEADERS={'oai-authenticated-user-id':'fixture-site-scoped-owner','oai-authenticated-user-email':TEST_OWNER_EMAIL};
export const AUTH_ENV={UPDATE_OWNER_EMAIL:TEST_OWNER_EMAIL,UPDATE_SERVICE_TOKEN_SHA256:createHash('sha256').update(TEST_SERVICE_TOKEN).digest('hex')};
export const ownerEnv=bindings=>({...bindings,...AUTH_ENV});
export function ownerRequest(input,init={}){
 const headers=new Headers(OWNER_HEADERS);new Headers(init.headers).forEach((value,key)=>headers.set(key,value));
 return new Request(input,{...init,headers});
}
