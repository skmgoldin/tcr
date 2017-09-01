const AWS = require('aws-sdk');
const fs = require('fs');

const registryArtifact = JSON.parse(fs.readFileSync('build/contracts/Registry.json'));
const plcrArtifact = JSON.parse(fs.readFileSync('build/contracts/PLCRVoting.json'));
const parameterizerArtifact = JSON.parse(fs.readFileSync('build/contracts/Parameterizer.json'));
const saleArtifact = JSON.parse(fs.readFileSync('build/contracts/Sale.json'));
const tokenArtifact = JSON.parse(fs.readFileSync('build/contracts/HumanStandardToken.json'));

const BUCKET = 'adchain-registry-contracts';

const secrets = JSON.parse(fs.readFileSync('secrets.json', 'utf8'));
const accessKeyId = secrets.accessKeyId;
const secretAccessKey = secrets.secretAccessKey;

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  accessKeyId,
  secretAccessKey,
});

const uploadParams = {
  Bucket: BUCKET,
  ACL: 'public-read',
  Body: '',
};

const registryParams = uploadParams;
registryParams.Key = 'Registry.json';
registryParams.Body = JSON.stringify(registryArtifact, null, '  ');

s3.upload(registryParams, (err) => {
  if (err) { throw err; }
  console.log('Uploaded registry');
});

const plcrParams = uploadParams;
plcrParams.Key = 'PLCRVoting.json';
plcrParams.Body = JSON.stringify(plcrArtifact, null, '  ');

s3.upload(plcrParams, (err) => {
  if (err) { throw err; }
  console.log('Uploaded plcr');
});

const parameterizerParams = uploadParams;
parameterizerParams.Key = 'Parameterizer.json';
parameterizerParams.Body = JSON.stringify(parameterizerArtifact, null, '  ');

s3.upload(parameterizerParams, (err) => {
  if (err) { throw err; }
  console.log('Uploaded parameterizer');
});

const saleParams = uploadParams;
saleParams.Key = 'Sale.json';
saleParams.Body = JSON.stringify(saleArtifact, null, '  ');

s3.upload(saleParams, (err) => {
  if (err) { throw err; }
  console.log('Uploaded sale');
});

const tokenParams = uploadParams;
tokenParams.Key = 'HumanStandardToken.json';
tokenParams.Body = JSON.stringify(tokenArtifact, null, '  ');

s3.upload(tokenParams, (err) => {
  if (err) { throw err; }
  console.log('Uploaded token');
});

