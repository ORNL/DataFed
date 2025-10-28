"use strict";

const Joi = require("joi");

const repositoryGlobusSchema = Joi.object({
    repo_id: Joi.string().required(),
    type: Joi.string().valid(RepositoryType.GLOBUS).required(),
    title: Joi.string().min(1).required(),
    desc: Joi.string().required().allow(""),
    capacity: Joi.number().required(),
    endpoint: Joi.string().uri().required().allow(""),
    path: Joi.string().required().allow(""),
    pub_key: Joi.string().required().allow(""),
    address: Joi.string().required(),
    exp_path: Joi.string().required().allow(""),
});

const repositoryMetadataSchema = Joi.object({
    repo_id: Joi.string().required(),
    type: Joi.string().valid(RepositoryType.METADATA).required(),
    title: Joi.string().min(1).required(),
    desc: Joi.string().required().allow(""),
    capacity: Joi.number().required(),
});
