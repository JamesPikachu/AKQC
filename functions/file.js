export async function onRequestGet(context) {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const filePath = url.searchParams.get('path');

        if (!filePath) {
            return new Response('File path required', {
                status: 400,
                headers: { 
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }

        console.log('Fetching file:', filePath);

        // R2에서 파일 가져오기
        const object = await env.R2_BUCKET.get(filePath);
        
        if (!object) {
            return new Response('File not found', {
                status: 404,
                headers: { 
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }

        // 이미지 직접 스트리밍
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'public, max-age=3600');
        
        // Content-Type 설정
        const fileName = filePath.split('/').pop().toLowerCase();
        if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
            headers.set('Content-Type', 'image/jpeg');
        } else if (fileName.endsWith('.png')) {
            headers.set('Content-Type', 'image/png');
        } else if (fileName.endsWith('.gif')) {
            headers.set('Content-Type', 'image/gif');
        } else if (fileName.endsWith('.pdf')) {
            headers.set('Content-Type', 'application/pdf');
        }
        
        return new Response(object.body, { headers });

    } catch (error) {
        console.error('File access error:', error);
        return new Response('File access failed', {
            status: 500,
            headers: { 
                'Access-Control-Allow-Origin': '*'
            },
        });
    }
}

// PDF 다운로드를 위한 POST 엔드포인트
export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { path } = await request.json();

        if (!path) {
            return new Response('File path required', { status: 400 });
        }

        const object = await env.R2_BUCKET.get(path);
        
        if (!object) {
            return new Response('File not found', { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Content-Type', 'application/pdf');
        headers.set('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
        
        return new Response(object.body, { headers });

    } catch (error) {
        console.error('Download error:', error);
        return new Response('Download failed', { 
            status: 500,
            headers: { 
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}