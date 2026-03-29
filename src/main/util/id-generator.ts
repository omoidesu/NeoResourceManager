import {Snowflake} from "nodejs-snowflake";

class IdGenerator {
  private static instance: Snowflake;

  private static getInstance() {
    if (!IdGenerator.instance) {
      IdGenerator.instance = new Snowflake({
        custom_epoch: 1774036800000,// 2026-3-21 4:00:00
        instance_id: 1
      })
    }
    return IdGenerator.instance;
  }

  static generate(): string {
    return IdGenerator.getInstance().getUniqueID().toString()
  }
}

export const generateId = IdGenerator.generate
