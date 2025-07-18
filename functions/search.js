export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { poNumber, snNumber } = await request.json();

        console.log('Search request:', { poNumber, snNumber });
        console.log('R2_BUCKET available:', !!env.R2_BUCKET);

        // R2에서 파일 목록 조회
        const results = await searchFiles(env.R2_BUCKET, poNumber, snNumber);

        return new Response(JSON.stringify(results), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    } catch (error) {
        console.error('Search error:', error);
        return new Response(JSON.stringify({ error: 'Search failed', details: error.message }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    }
}

async function searchFiles(bucket, poNumber, snNumber) {
    const results = {
        qcCheckList: [],
        eevPhotos: [],
        caseControllerPhotos: [],
        showcasePhotos: []
    };

    try {
        // QC Check List 검색
        if (poNumber) {
            const qcPrefix = `1. QC check list/${poNumber}/`;
            const qcFiles = await listFiles(bucket, qcPrefix);
            results.qcCheckList = qcFiles.filter(file => 
                file.key.endsWith('.pdf') && 
                (snNumber ? file.key.includes(snNumber) : true)
            ).map(file => ({
                name: file.key.split('/').pop(),
                path: file.key
            }));
        }

        // SN번호로 검색하는 경우 모든 PO 폴더 검색
        if (snNumber && !poNumber) {
            const qcPrefix = `1. QC check list/`;
            const qcFiles = await listFiles(bucket, qcPrefix);
            results.qcCheckList = qcFiles.filter(file => 
                file.key.endsWith('.pdf') && file.key.includes(snNumber)
            ).map(file => ({
                name: file.key.split('/').pop(),
                path: file.key
            }));
        }

        // Photo 폴더들 검색
        const photoSections = [
            { key: 'eevPhotos', path: '2. Photo/1.EEV/' },
            { key: 'caseControllerPhotos', path: '2. Photo/2.Case controller/' },
            { key: 'showcasePhotos', path: '2. Photo/3.Showcase photo/' }
        ];

        for (const section of photoSections) {
            if (poNumber) {
                const sectionPrefix = `${section.path}${poNumber}/`;
                const sectionFiles = await listFiles(bucket, sectionPrefix);
                results[section.key] = sectionFiles.filter(file => 
                    isImageFile(file.key) && 
                    (snNumber ? file.key.includes(snNumber) : true)
                ).map(file => ({
                    name: file.key.split('/').pop(),
                    path: file.key
                }));
            } else if (snNumber) {
                // SN번호로 검색하는 경우 모든 PO 폴더 검색
                const sectionFiles = await listFiles(bucket, section.path);
                results[section.key] = sectionFiles.filter(file => 
                    isImageFile(file.key) && file.key.includes(snNumber)
                ).map(file => ({
                    name: file.key.split('/').pop(),
                    path: file.key
                }));
            }
        }

    } catch (error) {
        console.error('File search error:', error);
    }

    return results;
}

async function listFiles(bucket, prefix) {
    const files = [];
    let cursor;

    try {
        do {
            const options = { prefix };
            if (cursor) options.cursor = cursor;

            const listed = await bucket.list(options);
            files.push(...listed.objects);
            cursor = listed.cursor;
        } while (cursor);
    } catch (error) {
        console.error('List files error:', error);
    }

    return files;
}

function isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}