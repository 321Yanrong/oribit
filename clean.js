import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

try {
  readFileSync('.env', 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#')).forEach(l => {
      const [k, ...v] = l.split('=')
      if (k && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim()
    })
} catch {}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function cleanBucket() {
    const bucketName = 'photos';

    // 1. 先获取根目录下所有的“文件夹”（用户ID）
    console.log('正在读取根目录...');
    const { data: folders, error: folderError } = await supabase.storage.from(bucketName).list('');

    if (folderError) {
        console.error('读取根目录失败:', folderError);
        return;
    }

    console.log(`发现 ${folders.length} 个潜在用户文件夹。`);

    for (const folder of folders) {
        // 如果是文件（有 metadata）则直接处理，如果是文件夹（没有 metadata）则进去找
        const isFolder = !folder.metadata;
        const folderName = folder.name;

        if (isFolder) {
            console.log(`--- 进入文件夹: ${folderName} ---`);

            // 2. 获取该文件夹下的所有图片
            const { data: files, error: fileError } = await supabase.storage.from(bucketName).list(folderName);

            if (fileError) {
                console.error(`读取文件夹 ${folderName} 失败:`, fileError);
                continue;
            }

            for (const file of files) {
                const filePath = `${folderName}/${file.name}`;

                // 3. 检查大小：大于 1MB (1048576 bytes) 才处理
                if (file.metadata && file.metadata.size > 1024 * 1024) {
                    console.log(`发现大图: ${filePath} (${(file.metadata.size / 1024 / 1024).toFixed(2)} MB)`);

                    try {
                        // 下载
                        const { data: blob, error: dlError } = await supabase.storage.from(bucketName).download(filePath);
                        if (dlError) throw dlError;

                        const buffer = Buffer.from(await blob.arrayBuffer());

                        // 压缩
                        const compressedBuffer = await sharp(buffer)
                            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                            .jpeg({ quality: 75 })
                            .toBuffer();

                        // 传回覆盖
                        const { error: upError } = await supabase.storage.from(bucketName).upload(filePath, compressedBuffer, {
                            contentType: 'image/jpeg',
                            upsert: true
                        });

                        if (upError) throw upError;
                        console.log(`✅ 处理成功: ${file.name} -> ${(compressedBuffer.length / 1024).toFixed(2)} KB`);

                    } catch (err) {
                        console.error(`❌ 处理 ${file.name} 时出错:`, err.message);
                    }
                } else {
                    // console.log(`跳过小文件: ${file.name}`);
                }
            }
        }
    }
    console.log('✨ 所有文件夹扫描完毕！');
}

cleanBucket();