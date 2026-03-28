import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Ferramenta de Soberania Total do Agente.
 * Permite ao agente modificar seu próprio código e rodar comandos no terminal.
 */
export const autonomousTool = {
  name: "autonomous_action",
  description: "Executa comandos no terminal ou escreve novos arquivos de código TypeScript para expandir as próprias capacidades. Use para resolver QUALQUER problema técnico ou aprender novas tarefas.",
  parameters: {
    type: "OBJECT",
    properties: {
      actionType: {
        type: "STRING",
        enum: ["run_command", "write_file", "npm_install"],
        description: "Tipo de ação autônoma (rodar comando, escrever arquivo ou instalar pacote)."
      },
      command: {
        type: "STRING",
        description: "O comando shell a ser executado (se actionType for run_command ou npm_install)."
      },
      filePath: {
        type: "STRING",
        description: "Caminho do arquivo a ser criado/editado (se actionType for write_file)."
      },
      content: {
        type: "STRING",
        description: "Conteúdo do arquivo TypeScript (se actionType for write_file)."
      }
    },
    required: ["actionType"]
  },

  execute: async (args: any) => {
    try {
      console.log(`[AUTONOMIA]: Executando ${args.actionType}...`);

      if (args.actionType === "run_command" || args.actionType === "npm_install") {
        const output = execSync(args.command, { encoding: 'utf-8' });
        return `Comando executado com sucesso. Output: ${output}`;
      }

      if (args.actionType === "write_file" && args.filePath && args.content) {
        const fullPath = path.resolve(args.filePath);
        // Garante que a pasta existe
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, args.content);
        return `Arquivo ${args.filePath} escrito com sucesso. O bot irá reiniciar para aplicar as mudanças.`;
      }

      return "Ação inválida ou parâmetros faltando.";
    } catch (error: any) {
      console.error("[AUTONOMIA] Erro:", error);
      return `Erro na ação autônoma: ${error.message}`;
    }
  }
};
