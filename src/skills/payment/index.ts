import {
  cancelPurchaseTool,
  completePurchaseTool,
  confirmPurchaseTool,
  getPaymentCredentialsTool,
  initiatePurchaseTool,
} from "../../tools/paymentTool.js";
import type { Skill, SkillTool } from "../types.js";

const skill: Skill = {
  name: "payment",
  version: "1.0.0",
  description: "Online purchase flow: initiate, confirm, complete and cancel purchases",
  tools: [
    {
      name: getPaymentCredentialsTool.name,
      description: getPaymentCredentialsTool.description,
      parameters: getPaymentCredentialsTool.parameters as Record<string, unknown>,
      logBlocklist: true,
      execute(_args, _sessionId) {
        return getPaymentCredentialsTool.execute();
      },
    } satisfies SkillTool,
    {
      name: initiatePurchaseTool.name,
      description: initiatePurchaseTool.description,
      parameters: initiatePurchaseTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return initiatePurchaseTool.execute(
          args as Parameters<typeof initiatePurchaseTool.execute>[0]
        );
      },
    } satisfies SkillTool,
    {
      name: confirmPurchaseTool.name,
      description: confirmPurchaseTool.description,
      parameters: confirmPurchaseTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return confirmPurchaseTool.execute(
          args as Parameters<typeof confirmPurchaseTool.execute>[0]
        );
      },
    } satisfies SkillTool,
    {
      name: completePurchaseTool.name,
      description: completePurchaseTool.description,
      parameters: completePurchaseTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return completePurchaseTool.execute(
          args as Parameters<typeof completePurchaseTool.execute>[0]
        );
      },
    } satisfies SkillTool,
    {
      name: cancelPurchaseTool.name,
      description: cancelPurchaseTool.description,
      parameters: cancelPurchaseTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return cancelPurchaseTool.execute(args as Parameters<typeof cancelPurchaseTool.execute>[0]);
      },
    } satisfies SkillTool,
  ],
};

export default skill;
