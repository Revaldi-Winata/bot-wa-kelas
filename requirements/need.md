# Bot WhatsApp Kelas

Bot WhatsApp dengan nomor sendiri yang akan dimasukkan ke grup kelas, dan bisa digunakan oleh masing-masing mahasiswa untuk cek/cari informasi.

## Fitur

1. Cek Jadwal Kuliah
2. Cari Kontak Dosen
3. Cari Informasi
    - Tugas
    - Project
    - Akademik
    - Sertifikasi
    - Pra-UAPS/UAPS -> Skripsi/Tugas Akhir
    - TOELF
    - UJIKOM
    - Lainnya

### Extend Fitur

Jika bisa bot ini checking ke GDrive pengumpulan Tugas Mata Kuliah dengan deteksi file/foto yang diupload apakah sudah benar nama file dan sudah sesuai dengan format yang diminta, dan kalau tidak sesuai bisa diminta upload ulang dengan format yang benar.

### Penjelasan Fitur

a. Cek Jadwal Kuliah
    - User menggunakan '/jadwal' lalu bot menampilkan tombol.
    - User mengklik tombol yang sesuai dengan hari yang ingin dicari tahu jadwal kuliahnya atau lengkap, contohnya 'Senin' lalu bot menampilkan jadwal mata kuliah yang sesuai dengan hari itu.
    - Bot menampilkan data yang diminta oleh user.
b. Cari Kontak Dosen
    - User menggunakan '/kontak' lalu bot menampilkan tombol.
    - User mengklik tombol yang sesuai dengan mata kuliah yang ingin dicari tahu kontak dosennya, contohnya 'Basis Data' lalu bot menampilkan kontak dosen yang sesuai dengan mata kuliah itu.
    - Bot menampilkan data yang diminta oleh user.
c. Cek Tugas, Project(Project adalah Tugas dari Mata Kuliah)
    - User menggunakan '/cek-tugas' lalu menampilkan tugas-tugas yang ada pada masing-masing tugas mata kuliah.
    - Bot memberikan tombol dari masing-masing tugas mata kuliah untuk detail tugasnya.
d. Cek Pra-UAPS/UAPS -> Skripsi/Tugas Akhir
    - User menggunakan '/cek-uaps' bot menamppilkan tombol.
    - Pilihan tombol berdasarkan nanti yang diconfigurasi dari dashboard.
e. Cek TOELF
    - User menggunakan '/cek-toelf' lalu bot menampilkan tombol.
    - Sama seperti UAPS.
g. Cek UJIKOM
    - User menggunakan '/cek-ujikom' lalu bot menampilkan tombol.
    - Sama seperti UAPS.

## Dashboard Bot

Di kelola oleh Ketua Kelas saja dengan 1 kredensial tetap. Mengatur seluruh data yang akan digunakan oleh bot.

## Diskusi

- Menggunakan bahasa apa?
- Arsitekturnya bagaimana?
- Metode pengembangan seperti apa?
- Apakah dengan membuat bot WhatsApp, nomor sendiri akan terblokir/suspend dari Meta?
- Hosting free, di mana?
- Zero Cost diutamakan.
- Bot tidak digunakan bisnis, bukan untuk pemasaran yang mengirimkan ribuan pesan tiap harinya.
- Bot hanya digunakan sebagai informasi kelas real-time dan terintegrasi daripada membuat website.
- Bot terintegrasi dengan website akademik bukan menggunakan akademik.
- Bot secara real-time mengambil data dari website resmi jika update informasi.
- Trade-off bot WhatsApp, risiko, mitigasi, solusi, dan sebagainya. Apakah lebih baik menggunakan bot Discord daripada WhatsApp.