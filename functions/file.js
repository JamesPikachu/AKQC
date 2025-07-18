export async function onRequestGet(context) {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const filePath = url.searchParams.get('path');

        if (!filePath) {
            return new Response(JSON.stringify({ error: 'File path required' }), {
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }

        // R2에서 파일 가져오기
        const object = await env.R2_BUCKET.get(filePath);
        
        if (!object) {
            return new Response(JSON.stringify({ error: 'File not found' }), {
                status: 404,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }

        // 파일 타입 결정
        const fileName = filePath.split('/').pop();
        const fileType = fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';

        // 파일 직접 전송 또는 URL 생성
        if (fileType === 'image') {
            // 이미지는 직접 스트리밍
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Cache-Control', 'public, max-age=3600');
            
            return new Response(object.body, { headers });
        } else {
            // PDF는 메타데이터 반환
            return new Response(JSON.stringify({
                name: fileName,
                type: fileType,
                path: filePath,
                size: object.size
            }), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
            });
        }

    } catch (error) {
        console.error('File access error:', error);
        return new Response(JSON.stringify({ error: 'File access failed' }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    }
}

// PDF 다운로드를 위한 별도 엔드포인트
export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { path } = await request.json();

        const object = await env.R2_BUCKET.get(path);
        
        if (!object) {
            return new Response('File not found', { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
        
        return new Response(object.body, { headers });

    } catch (error) {
        console.error('Download error:', error);
        return new Response('Download failed', { status: 500 });
    }
}