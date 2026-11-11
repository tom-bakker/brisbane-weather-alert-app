import {Client} from 'basic-ftp';
import {Writable} from 'node:stream';

const HOST = 'ftp.bom.gov.au';
const DIRECTORY = '/anon/gen/fwo/';
/**
 * Warning products in BoM's AMOC XML format: every Queensland product, plus
 * NSW severe thunderstorm warnings, because Gold Coast Airport sits on the
 * border and storms over the Tweed are warned for by the NSW office.
 */
const WARNING_FILE = /^(IDQ\d+|IDN21033)\.amoc\.xml$/;
/** Latest reading from every Queensland weather station. */
const QLD_OBSERVATIONS = 'IDQ60920.xml';

class BufferSink extends Writable {
  private readonly chunks: Buffer[] = [];

  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void) {
    this.chunks.push(chunk);
    done();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>) {
  const client = new Client(30_000);
  try {
    await client.access({host: HOST, user: 'anonymous', password: 'guest'});
    return await work(client);
  } finally {
    client.close();
  }
}

async function download(client: Client, name: string): Promise<string> {
  const sink = new BufferSink();
  await client.downloadTo(sink, `${DIRECTORY}${name}`);
  return sink.text();
}

/** Whether a file in BoM's FTP directory is a warning the app reads. */
export function isWarningFile(name: string): boolean {
  return WARNING_FILE.test(name);
}

/**
 * Downloads every current Queensland warning (and NSW thunderstorm warning) from the BoM anonymous FTP
 * service. BoM blocks automated HTTP access to its website and points
 * automated users to this channel instead.
 */
export function fetchBomAmocDocuments(): Promise<string[]> {
  return withClient(async (client) => {
    const files = await client.list(DIRECTORY);
    const documents: string[] = [];
    for (const file of files.filter((f) => isWarningFile(f.name))) {
      documents.push(await download(client, file.name));
    }
    return documents;
  });
}

/**
 * Downloads the latest Queensland weather station observations (the data
 * behind BoM's IDQ60801 station pages), which report every wind gust.
 */
export function fetchBomObservationDocument(): Promise<string> {
  return withClient((client) => download(client, QLD_OBSERVATIONS));
}
