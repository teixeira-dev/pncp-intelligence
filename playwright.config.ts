import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"./e2e",workers:1,timeout:60000,use:{baseURL:"http://localhost:3000",trace:"retain-on-failure",screenshot:"only-on-failure"},reporter:[["list"],["html",{open:"never"}]]});
