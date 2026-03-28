import { webSearchTool } from './src/tools/webSearch.js';

async function test() {
  const result = await webSearchTool.execute("filmes em cartaz shopping mooca amanha");
  console.log(result);
}

test();
