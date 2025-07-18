export async function onRequestGet(context) {
    try {
        const { env } = context;

        console.log('Tree structure request received');
        console.log('R2_BUCKET available:', !!env.R2_BUCKET);

        // R2에서 모든 파일 목록 조회
        const treeData = await buildTreeStructure(env.R2_BUCKET);

        return new Response(JSON.stringify(treeData), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    } catch (error) {
        console.error('Tree structure error:', error);
        return new Response(JSON.stringify({ 
            error: 'Tree structure failed', 
            details: error.message 
        }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    }
}

async function buildTreeStructure(bucket) {
    const allFiles = [];
    let cursor;

    try {
        // R2에서 모든 파일 목록 가져오기
        do {
            const options = {};
            if (cursor) options.cursor = cursor;

            const listed = await bucket.list(options);
            allFiles.push(...listed.objects);
            cursor = listed.cursor;
        } while (cursor);

        console.log(`Total files found: ${allFiles.length}`);

        // 트리 구조 생성
        const tree = [];
        const pathMap = new Map();
        
        // 통계 정보
        const stats = {
            totalFiles: 0,
            totalFolders: 0,
            pdfFiles: 0,
            imageFiles: 0
        };

        // 파일들을 경로별로 정리
        allFiles.forEach(file => {
            if (file.key.endsWith('/')) return; // 폴더는 제외
            
            stats.totalFiles++;
            
            // 파일 확장자 확인
            const fileName = file.key.split('/').pop().toLowerCase();
            if (fileName.endsWith('.pdf')) {
                stats.pdfFiles++;
            } else if (isImageFile(fileName)) {
                stats.imageFiles++;
            }

            const pathParts = file.key.split('/');
            let currentLevel = tree;
            let currentPath = '';

            // 경로의 각 부분을 처리
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                currentPath += (currentPath ? '/' : '') + part;

                if (i === pathParts.length - 1) {
                    // 파일인 경우
                    currentLevel.push({
                        name: part,
                        type: 'file',
                        path: file.key,
                        size: file.size
                    });
                } else {
                    // 폴더인 경우
                    let folder = currentLevel.find(item => item.name === part && item.type === 'folder');
                    if (!folder) {
                        folder = {
                            name: part,
                            type: 'folder',
                            path: currentPath,
                            children: []
                        };
                        currentLevel.push(folder);
                        stats.totalFolders++;
                    }
                    currentLevel = folder.children;
                }
            }
        });

        // 트리 정렬 (폴더 먼저, 그 다음 파일)
        sortTree(tree);

        return {
            tree,
            stats,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Build tree structure error:', error);
        throw error;
    }
}

function sortTree(items) {
    items.sort((a, b) => {
        // 폴더를 파일보다 먼저 정렬
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        
        // 같은 타입끼리는 이름순 정렬
        return a.name.localeCompare(b.name, 'ko', { numeric: true });
    });

    // 하위 폴더들도 재귀적으로 정렬
    items.forEach(item => {
        if (item.type === 'folder' && item.children) {
            sortTree(item.children);
        }
    });
}

function isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExtensions.some(ext => filename.endsWith(ext));
}