import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'

export async function GET() {
  try {
    const file = await readFile('/home/z/my-project/maison-khan.zip')
    
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="maison-khan.zip"',
        'Content-Length': file.length.toString(),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
  }
}
