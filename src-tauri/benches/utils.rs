use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::fs;
use story_forge_lib::modules::maps::decode_position;
use story_forge_lib::modules::utils::{dir_size, format_size, generate_id};
use tempfile::TempDir;

fn bench_generate_id(c: &mut Criterion) {
    c.bench_function("generate_id short", |b| {
        b.iter(|| generate_id(black_box("My Vintage World")))
    });

    c.bench_function("generate_id long", |b| {
        b.iter(|| {
            generate_id(black_box(
                "A very long installation name with many words and characters",
            ))
        })
    });
}

fn bench_format_size(c: &mut Criterion) {
    let sizes = [0u64, 512, 1024, 1024 * 1024, 1024 * 1024 * 1024, u64::MAX];
    c.bench_function("format_size", |b| {
        b.iter(|| {
            for size in &sizes {
                black_box(format_size(black_box(*size)));
            }
        })
    });
}

fn bench_dir_size(c: &mut Criterion) {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();

    // Create a modest synthetic tree
    for i in 0..50 {
        let dir = root.join(format!("dir{}", i));
        fs::create_dir_all(&dir).unwrap();
        for j in 0..20 {
            fs::write(dir.join(format!("file{}.txt", j)), "hello world".repeat(50)).unwrap();
        }
    }

    c.bench_function("dir_size 1k files", |b| {
        b.iter(|| {
            black_box(dir_size(black_box(root)));
        })
    });
}

fn bench_decode_position(c: &mut Criterion) {
    let positions = [0i64, 1234567, -42, i64::MAX, i64::MIN];
    c.bench_function("decode_position", |b| {
        b.iter(|| {
            for pos in &positions {
                black_box(decode_position(black_box(*pos)));
            }
        })
    });
}

criterion_group!(
    benches,
    bench_generate_id,
    bench_format_size,
    bench_dir_size,
    bench_decode_position
);
criterion_main!(benches);
