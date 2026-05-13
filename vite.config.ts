import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	root: "examples",
	build: {
		rollupOptions: {
			input: {
				main: "./examples/index.html",
				offscreen: "./examples/offscreen-render.html",
			},
		},
	},
	server: {
		host: true, // Cho phép truy cập qua IP máy tính
		port: 5173  // Bạn có thể đổi port nếu muốn
	}
});
