import AWS from 'aws-sdk';
import yauzl from 'yauzl';

function promisify(api) {
  return function (...args) {
    return new Promise(((resolve, reject) => {
      api(...args, (err, response) => {
        if (err) return reject(err);
        resolve(response);
        return true;
      });
    }));
  };
}

const S3 = new AWS.S3({
  region: 'your-aws-region',
});

const bucket = 'NameOfYourBucket';

export const handler = async (event) => {

  // HERE WE GET THE FILE WHO
  // ACTIVATE THE S3 TRIGGER'S EVENT
  const file_key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  
  const params = {
    Bucket: bucket,
    Key: file_key,
  };

  try {
    await S3.getObject(params)
      .promise()
      .then((data) => {

        // BUFFER
        const readFromBuffer = promisify(yauzl.fromBuffer);
        return readFromBuffer(data.Body, { lazyEntries: true }, async (err, zipfile) => {

          // IN CASE OF BUFFER ERROR
          if (err) throw err;

          // OPEN STREAM
          const openReadStream = promisify(zipfile.openReadStream.bind(zipfile));
          zipfile.readEntry();
          zipfile.on('entry', async (entry) => {

            // READ, UNCOMPRESS AND SAVE FILE ON BUCKET
            const stream = await openReadStream(entry);

            stream.on('end', () => {
              zipfile.readEntry();
            });

            stream.length = entry.uncompressedSize;
            const originalName = entry.fileName;

            const filePath = `upload-folder/${originalName}`;

            // PUT ON S3
            S3.putObject({
              Bucket: bucket,
              Key: filePath,
              Body: stream,
            }, async (error) => {
              if (error) {
                return { status: 'UNZIP_FAILED' };
              } 
            });

          });
          zipfile.on('end', async () => {
            return { status: 'UNZIPED' };
          });
        });
      });

  } catch (err) {
    return Promise.reject(err);
  }
};