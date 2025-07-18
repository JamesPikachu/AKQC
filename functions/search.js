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
        // QC Check List 검색 - PO번호도 부분 일치로 검색
        if (poNumber || snNumber) {
            const qcPrefix = `1. QC check list/`;
            const qcFiles = await listFiles(bucket, qcPrefix);
            results.qcCheckList = qcFiles.filter(file => {
                if (!file.key.endsWith('.pdf')) return false;

                let matchesPO = true;
                let matchesSN = true;

                if (poNumber) {
                    // PO번호 와일드카드 검색
                    matchesPO = wildcardMatch(file.key, poNumber);
                }

                if (snNumber) {
                    // SN번호 와일드카드 검색
                    matchesSN = wildcardMatch(file.key, snNumber);
                }

                return matchesPO && matchesSN;
            }).map(file => ({
                name: file.key.split('/').pop(),
                path: file.key
            }));
        }

        // Photo 폴더들 검색 - PO번호도 부분 일치로 검색
        const photoSections = [
            { key: 'eevPhotos', path: '2. Photo/1.EEV/' },
            { key: 'caseControllerPhotos', path: '2. Photo/2.Case controller/' },
            { key: 'showcasePhotos', path: '2. Photo/3.Showcase photo/' }
        ];

        for (const section of photoSections) {
            if (poNumber || snNumber) {
                const sectionFiles = await listFiles(bucket, section.path);
                results[section.key] = sectionFiles.filter(file => {
                    if (!isImageFile(file.key)) return false;

                    let matchesPO = true;
                    let matchesSN = true;

                    if (poNumber) {
                        // PO번호 와일드카드 검색
                        matchesPO = wildcardMatch(file.key, poNumber);
                    }

                    if (snNumber) {
                        // SN번호 와일드카드 검색
                        matchesSN = wildcardMatch(file.key, snNumber);
                    }

                    return matchesPO && matchesSN;
                }).map(file => ({
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

/**
 * 엑셀 스타일 와일드카드 패턴 매칭 함수
 * @param {string} text - 검색 대상 텍스트
 * @param {string} pattern - 와일드카드 패턴
 * @returns {boolean} - 매칭 여부
 * 
 * 지원하는 패턴:
 * * : 0개 이상의 임의 문자 (예: *123* → "ka123qa" 매칭)
 * ? : 정확히 1개의 임의 문자 (예: ?123 → "K123" 매칭, "KK123" 불매칭)
 * 대소문자 구분 안함
 */
function wildcardMatch(text, pattern) {
    // 대소문자 구분 없이 비교
    const lowerText = text.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    
    // 와일드카드가 없으면 단순 포함 검색
    if (!lowerPattern.includes('*') && !lowerPattern.includes('?')) {
        return lowerText.includes(lowerPattern);
    }
    
    // 정규식으로 변환
    // * → .* (0개 이상의 임의 문자)
    // ? → . (정확히 1개의 임의 문자)
    // 특수문자 이스케이프
    let regexPattern = lowerPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 정규식 특수문자 이스케이프
        .replace(/\*/g, '.*')  // * → .*
        .replace(/\?/g, '.');  // ? → .
    
    try {
        const regex = new RegExp(regexPattern, 'i'); // 대소문자 구분 없음
        return regex.test(lowerText);
    } catch (error) {
        console.error('Regex error:', error);
        // 정규식 오류 시 기본 포함 검색으로 fallback
        return lowerText.includes(lowerPattern.replace(/[*?]/g, ''));
    }
}