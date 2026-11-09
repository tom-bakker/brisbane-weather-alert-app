import {Client} from 'basic-ftp';
import {Writable} from 'node:stream';

const HOST = 'ftp.bom.gov.au';
const DIRECTORY = '/anon/gen/fwo/';
/** Queensland warning products in BoM's AMOC XML format. */
const QLD_AMOC = /^IDQ\d+\.amoc\.xml$/;

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

/**
 * Downloads every current Queensland warning from the BoM anonymous FTP
 * service. BoM blocks automated HTTP access to its website and points
 * automated users to this channel instead.
 */
export async function fetchBomAmocDocuments(): Promise<string[]> {
  const client = new Client(30_000);
  try {
    await client.access({host: HOST, user: 'anonymous', password: 'guest'});
    const files = await client.list(DIRECTORY);
    const documents: string[] = [];
    for (const file of files.filter((f) => QLD_AMOC.test(f.name))) {
      const sink = new BufferSink();
      await client.downloadTo(sink, `${DIRECTORY}${file.name}`);
      documents.push(sink.text());
    }
    return documents;
  } finally {
    client.close();
  }
}
