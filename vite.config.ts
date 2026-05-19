import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	// Sử dụng đường dẫn tương đối để chạy được trên WebView (file:///android_asset/...)
	base: "./",
	
	// Thư mục chứa các file ví dụ
	root: "examples",
	
	build: {
		// Xuất file build ra thư mục dist ở gốc dự án để dễ copy sang Android
		outDir: "../dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(__dirname, "examples/index.html"),
				offscreen: resolve(__dirname, "examples/offscreen-render.html"),
				editor: resolve(__dirname, "examples/skin-editor.html"),
			},
		},
	},
	server: {
		host: true,
		port: 5173
	}
});
