import {
  cancelAppointmentTool,
  createAppointmentTool,
  listAppointmentsTool,
  updateAppointmentTool,
} from "../../tools/schedulingTool.js";
import type { Skill, SkillTool } from "../types.js";

const skill: Skill = {
  name: "scheduling",
  version: "1.0.0",
  description: "Appointment creation, listing, updating and cancellation",
  tools: [
    {
      name: createAppointmentTool.name,
      description: createAppointmentTool.description,
      parameters: createAppointmentTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return createAppointmentTool.execute(
          args as Parameters<typeof createAppointmentTool.execute>[0]
        );
      },
    } satisfies SkillTool,
    {
      name: listAppointmentsTool.name,
      description: listAppointmentsTool.description,
      parameters: listAppointmentsTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return listAppointmentsTool.execute(
          args as Parameters<typeof listAppointmentsTool.execute>[0]
        );
      },
    } satisfies SkillTool,
    {
      name: updateAppointmentTool.name,
      description: updateAppointmentTool.description,
      parameters: updateAppointmentTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return updateAppointmentTool.execute(
          args as Parameters<typeof updateAppointmentTool.execute>[0]
        );
      },
    } satisfies SkillTool,
    {
      name: cancelAppointmentTool.name,
      description: cancelAppointmentTool.description,
      parameters: cancelAppointmentTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return cancelAppointmentTool.execute(
          args as Parameters<typeof cancelAppointmentTool.execute>[0]
        );
      },
    } satisfies SkillTool,
  ],
};

export default skill;
