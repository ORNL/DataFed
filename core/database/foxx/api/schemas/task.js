"use strict";

const TaskStateSchema = Joi.object({
  repo_id: Joi.string().required(),
  subject: Joi.string().required(),
  data_limit: Joi.number().integer().required(),
  rec_limit: Joi.number().integer().required(),
  repo_path: Joi.string().required(),
}).required();

const TaskSchema = Joi.object({
  task_id: Joi.string().required(),
  type: Joi.number().integer().required(),
  status: Joi.number().integer().required(),
  msg: Joi.string().required(),
  ct: Joi.number().integer().required(),
  ut: Joi.number().integer().required(),
  client: Joi.string().required(),
  step: Joi.number().integer().required(),
  steps: Joi.number().integer().required(),
  state: TaskStateSchema,
}).required();

module.exports = {
    TaskSchema,
    TaskStateSchema
}
