"use strict";

const { TaskSchema } = require("./task");

const Joi = require('joi');

const SuccessResponseDirectSchema = Joi.object({
  execution_method: Joi.string().valid('deferred', 'direct').required(),
  result: Joi.any()
}).required();

//
// This function allows keeping the envelope while overwriting the 
// result with an arbitrary schema
//
function makeResponseDirectSchema(resultSchema) {
  return SuccessResponseDirectSchema.keys({
    result: resultSchema
  });
}

const SuccessResponseDeferredSchema = Joi.object({
  execution_method: Joi.string().valid('deferred', 'direct').required(),
  task: TaskSchema,
}).required();


module.exports = {
   SuccessResponseDeferredSchema,
   SuccessResponseDirectSchema,
   makeResponseDirectSchema
};
