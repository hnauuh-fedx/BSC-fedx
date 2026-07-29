Bạn đang làm việc trong dự án BSC Management.

Mục tiêu của bộ quy tắc này là giữ code đơn giản, thay đổi có kiểm soát và phần báo cáo ngắn gọn, nhưng không được đánh đổi tính đúng đắn của nghiệp vụ, bảo mật, dữ liệu hoặc khả năng kiểm thử.

# 1. Nguyên tắc triển khai

## 1.1. Chỉ làm đúng phạm vi được giao

- Chỉ triển khai yêu cầu đã được mô tả hoặc đã được xác nhận.
- Không tự thêm chức năng “có thể cần trong tương lai”.
- Không mở rộng phạm vi sang module khác nếu không thực sự cần thiết.
- Khi yêu cầu chưa rõ, ưu tiên phương án đơn giản nhất phù hợp với rule nghiệp vụ hiện có.
- Phải nêu rõ mọi giả định nghiệp vụ đã sử dụng.

## 1.2. Ưu tiên giải pháp sẵn có

Trước khi tạo code mới, phải kiểm tra khả năng tái sử dụng:

- module hiện có;
- service hiện có;
- guard, decorator, pipe, interceptor và filter hiện có;
- Prisma model, transaction và query helper hiện có;
- component, hook và service frontend hiện có;
- thư viện đã được cài trong workspace;
- pattern đang được sử dụng trong dự án.

Không tạo wrapper, abstraction hoặc dependency mới nếu stack hiện tại đã xử lý được yêu cầu hợp lý.

## 1.3. Thay đổi nhỏ nhất nhưng phải hoàn chỉnh

Ưu tiên diff nhỏ nhất có thể đáp ứng đầy đủ acceptance criteria.

Tuy nhiên, không được giảm code bằng cách bỏ qua:

- validation;
- authentication;
- authorization;
- kiểm tra ownership hoặc scope;
- audit log;
- transaction;
- error handling;
- migration;
- test;
- xử lý trạng thái nghiệp vụ;
- tính toàn vẹn dữ liệu.

Ít code hơn không quan trọng bằng code đúng và an toàn.

## 1.4. Không over-engineering

Không tự tạo các kiến trúc sau nếu chưa có yêu cầu thực tế:

- workflow engine tổng quát;
- event bus;
- message queue;
- state-machine framework;
- repository abstraction cho mọi model;
- generic CRUD framework;
- dynamic permission engine;
- plugin system;
- microservice;
- cache layer;
- custom ORM abstraction;
- class hoặc interface chỉ có một implementation và chưa mang lại giá trị rõ ràng.

Chỉ tạo abstraction khi có ít nhất hai trường hợp sử dụng thực tế hoặc giúp loại bỏ logic quan trọng đang bị lặp lại.

## 1.5. Không tối ưu sớm

Không tự tối ưu hiệu năng nếu chưa có bằng chứng về bottleneck.

Ưu tiên:

1. đúng nghiệp vụ;
2. bảo mật;
3. dễ đọc;
4. dễ kiểm thử;
5. dễ bảo trì;
6. sau đó mới tối ưu hiệu năng.

Nếu thực hiện tối ưu, phải nêu rõ:

- vấn đề hiện tại;
- bằng chứng;
- thay đổi đã thực hiện;
- trade-off.

# 2. Quy tắc bắt buộc của dự án BSC

## 2.1. Vai trò hệ thống

Hệ thống có các vai trò chính:

- Admin: quản trị hệ thống.
- Giám đốc: xem và quản lý ở cấp cao, không cần tạo BSC cá nhân.
- Quản lý: quản lý nhân viên trực thuộc, giao KPI, xem và duyệt BSC.
- Nhân viên: tự tạo và cập nhật BSC của mình.

Không tự thay đổi quyền của các vai trò này nếu chưa có yêu cầu.

## 2.2. Quyền sở hữu BSC

- Nhân viên tự tạo BSC của mình.
- Nhân viên không được tạo hoặc chỉnh sửa BSC của người khác.
- Quản lý chỉ được thao tác với nhân viên nằm trong phạm vi quản lý.
- Admin có quyền quản trị theo chính sách hệ thống.
- Giám đốc không bắt buộc có BSC cá nhân.

Mọi API liên quan BSC phải kiểm tra cả permission và phạm vi dữ liệu.

## 2.3. KPI

- KPI do cấp trên thiết lập.
- Nhân viên không được tự thay đổi KPI đã được cấp trên giao, trừ khi có quyền rõ ràng.
- Thay đổi KPI phải được ghi nhận audit log.
- Không được để client tự quyết định điểm hoặc trọng số cuối cùng.

## 2.4. Trạng thái BSC

Các trạng thái tối thiểu cần hỗ trợ:

- DRAFT: đang nhập hoặc đã lưu nháp.
- SUBMITTED: đã nộp cho cấp trên.
- RETURNED: bị trả lại để chỉnh sửa.
- APPROVED: đã được duyệt.

Quy tắc:

- Lưu chỉ cập nhật dữ liệu và tính lại kết quả hiển thị, không đồng nghĩa với nộp.
- Nhân viên chỉ được chỉnh sửa trực tiếp khi BSC ở trạng thái DRAFT hoặc RETURNED.
- Khi BSC ở trạng thái SUBMITTED hoặc APPROVED, dữ liệu phải bị khóa.
- Muốn sửa BSC đã nộp hoặc đã duyệt phải có quy trình yêu cầu mở lại hoặc được cấp trên trả lại.
- Không được cập nhật trạng thái chỉ dựa vào dữ liệu do frontend gửi.
- Backend phải xác thực mọi transition.
- Mỗi lần đổi trạng thái phải ghi audit log gồm người thao tác, trạng thái cũ, trạng thái mới và thời gian.

Không được cho phép transition tùy ý.

Transition mặc định:

- DRAFT → SUBMITTED
- RETURNED → SUBMITTED
- SUBMITTED → RETURNED
- SUBMITTED → APPROVED

Các transition khác phải bị từ chối trừ khi có rule được xác nhận riêng.

## 2.5. Cách tính và xếp loại

Backend phải giữ riêng các giá trị scoring:

- tỷ lệ hoàn thành thô và tỷ lệ hoàn thành HALF_UP đến số nguyên gần nhất;
- điểm công việc thô và điểm công việc HALF_UP đến bội số 10 gần nhất;
- điểm trọng số = điểm công việc đã làm tròn × trọng số / 100;
- tổng điểm = tổng Decimal chính xác của các điểm trọng số.

Không được tính điểm công việc từ tỷ lệ hoàn thành đã làm tròn. Công thức canonical hiện tại của điểm công việc giữ raw achievement; đây là seam riêng và chưa xác nhận thêm cap/threshold/bảng điểm. Frontend chỉ hiển thị các giá trị backend trả về.

`manager_total_score`, `final_score` và score snapshot của review lưu `Decimal(18,4)`. Việc nới precision không được dùng để tự động tính lại BSC đã duyệt.

Xếp loại dựa trên tổng điểm trọng số:

- D: dưới 70%
- C: từ 70% đến dưới 80%
- B: từ 80% đến dưới 90%
- A: từ 90% đến 100%
- A+: trên 100%

Phải làm rõ tại code boundary:

- 70% thuộc C.
- 80% thuộc B.
- 90% thuộc A.
- 100% thuộc A.
- Trên 100% mới thuộc A+.
- 111% và mọi điểm cao hơn vẫn thuộc A+.

Không được để frontend tự tính xếp loại làm nguồn dữ liệu chính.

Backend phải:

- tính điểm;
- tính tỷ lệ hoàn thành;
- xác định xếp loại;
- trả kết quả cho frontend.

Frontend chỉ hiển thị kết quả từ backend.

Phải có test cho các mốc biên:

- 69.99%
- 70%
- 79.99%
- 80%
- 89.99%
- 90%
- 100%
- 100.01%
- 111%

Khi triển khai thang điểm mới, BSC đã duyệt và snapshot lịch sử giữ nguyên xếp loại đã lưu. `A++` cũ vẫn phải xem, lọc và xuất được nhưng không được dùng cho đánh giá mới. BSC được tính hoặc duyệt lại sau triển khai sử dụng thang điểm mới.

## 2.6. Tính toàn vẹn dữ liệu

Các thao tác sau phải dùng transaction khi có nhiều thay đổi liên quan:

- cập nhật BSC và các tiêu chí;
- tính lại điểm;
- đổi trạng thái;
- ghi audit;
- cập nhật KPI hoặc trọng số;
- mở lại BSC để chỉnh sửa.

Không được để hệ thống rơi vào trạng thái:

- BSC đã đổi trạng thái nhưng audit chưa ghi;
- chi tiết đã cập nhật nhưng tổng điểm chưa cập nhật;
- một phần tiêu chí được lưu còn phần khác thất bại;
- BSC đã duyệt nhưng vẫn sửa được qua API.

## 2.7. Bảo mật

Mọi endpoint phải xem xét:

- người dùng đã đăng nhập chưa;
- có đúng permission không;
- có thuộc đúng phạm vi quản lý không;
- có sở hữu dữ liệu không;
- trạng thái hiện tại có cho phép thao tác không;
- dữ liệu đầu vào có hợp lệ không;
- hành động có cần audit không.

Không tin tưởng:

- role do client gửi;
- userId do client gửi;
- managerId do client gửi;
- tổng điểm do client gửi;
- xếp loại do client gửi;
- trạng thái do client gửi;
- quyền chỉnh sửa do frontend xác định.

Frontend ẩn nút không thay thế cho kiểm tra quyền ở backend.

# 3. Quy tắc code

## 3.1. Backend NestJS

Ưu tiên cấu trúc sẵn có của NestJS:

- Controller chỉ xử lý HTTP boundary.
- Service xử lý nghiệp vụ.
- Guard xử lý authentication và authorization chung.
- DTO và validation pipe xử lý dữ liệu đầu vào.
- Exception filter hoặc error pattern hiện có xử lý lỗi.
- Prisma service xử lý truy cập database.

Không đưa nghiệp vụ tính điểm hoặc transition vào controller.

Không tạo nhiều service nhỏ nếu chỉ dùng một lần và làm code khó theo dõi hơn.

## 3.2. Prisma

- Mọi thay đổi schema phải có migration.
- Không sửa trực tiếp database mà không cập nhật Prisma schema.
- Kiểm tra unique constraint, foreign key và index cần thiết.
- Không tạo index tùy tiện nếu chưa có query thực tế cần dùng.
- Khi thay đổi enum hoặc trạng thái phải kiểm tra dữ liệu cũ.
- Migration phải có khả năng triển khai trên database đã có dữ liệu.

## 3.3. Frontend

- Tái sử dụng component và service hiện có.
- Không sao chép logic tính điểm từ backend.
- Không tự quyết định quyền dựa trên role name nếu API đã trả capability.
- Nút Lưu và Nộp phải là hai hành động tách biệt.
- Khi BSC bị khóa, form phải ở chế độ chỉ xem.
- Phải xử lý loading, error, pending và retry phù hợp.
- Không báo thành công nếu request phụ bị lỗi.
- Không giữ optimistic state sai khi backend từ chối transition.

## 3.4. Error handling

Mọi lỗi nghiệp vụ phải có mã hoặc loại lỗi rõ ràng.

Ví dụ:

- BSC_NOT_EDITABLE
- INVALID_BSC_TRANSITION
- BSC_ALREADY_SUBMITTED
- BSC_ALREADY_APPROVED
- KPI_NOT_EDITABLE
- EMPLOYEE_OUT_OF_SCOPE
- BSC_PERMISSION_DENIED
- INVALID_SCORE_WEIGHT
- TOTAL_WEIGHT_INVALID

Không trả lỗi chung chung nếu có thể xác định nguyên nhân cụ thể.

# 4. Quy tắc test

Mọi thay đổi nghiệp vụ phải có test phù hợp.

Tối thiểu cần xem xét:

- trường hợp thành công;
- không đăng nhập;
- không có quyền;
- ngoài phạm vi quản lý;
- không sở hữu dữ liệu;
- trạng thái không cho phép chỉnh sửa;
- transition không hợp lệ;
- validation thất bại;
- transaction rollback;
- mốc biên tính điểm;
- audit không bị thiếu;
- API không tin dữ liệu tính điểm từ client.

Không viết test chỉ để đạt coverage.

Test phải xác nhận hành vi nghiệp vụ thực tế.

Sau khi thay đổi, chạy các lệnh phù hợp của workspace:

- lint;
- typecheck;
- unit test;
- integration test;
- build.

Nếu không chạy được test nào, phải nói rõ:

- test chưa chạy;
- nguyên nhân;
- rủi ro còn lại.

Không được nói “đã hoàn thành” nếu build hoặc test liên quan đang thất bại.

# 5. Quy tắc báo cáo kết quả

Phần trả lời sau khi hoàn thành task phải ngắn gọn nhưng không được thiếu thông tin quan trọng.

Sử dụng cấu trúc sau:

## Đã thay đổi

- Liệt kê hành vi chính đã sửa.
- Không mô tả dài dòng từng dòng code.

## File chính

- Liệt kê các file được thêm hoặc sửa.
- Chỉ nêu các file quan trọng.

## Kiểm tra

- Các lệnh test, typecheck, lint hoặc build đã chạy.
- Ghi rõ pass hoặc fail.
- Nếu fail, nêu nguyên nhân thực tế.

## Migration

Chỉ hiển thị nếu có thay đổi database:

- tên migration;
- tác động schema;
- rủi ro dữ liệu;
- cách rollback hoặc lưu ý deploy nếu cần.

## Giả định và rủi ro

- Nêu các giả định nghiệp vụ đã sử dụng.
- Nêu các vấn đề chưa được xác nhận.
- Nêu rủi ro bảo mật, phân quyền, dữ liệu hoặc workflow còn lại.

Không viết lời dẫn dài.

Không lặp lại toàn bộ yêu cầu của người dùng.

Không quảng cáo chất lượng của chính phần triển khai.

Không dùng các câu như:

- “Tôi đã triển khai một giải pháp toàn diện”.
- “Hệ thống hiện đã rất mạnh mẽ”.
- “Đây là kiến trúc có khả năng mở rộng cao”.

Chỉ báo cáo điều có thể kiểm chứng từ code và kết quả test.

# 6. Trình tự làm việc cho mỗi task

Trước khi sửa code:

1. Đọc rule nghiệp vụ liên quan.
2. Tìm implementation và pattern hiện có.
3. Xác định phạm vi thay đổi nhỏ nhất.
4. Xác định rủi ro về quyền, trạng thái, dữ liệu và migration.
5. Xác định test cần thêm hoặc cập nhật.

Trong khi sửa:

1. Không mở rộng sang yêu cầu khác.
2. Không đổi Authentication nếu task không liên quan.
3. Không thay đổi public API không cần thiết.
4. Không đổi cấu trúc project chỉ để làm code “đẹp hơn”.
5. Giữ backward compatibility nếu chưa được phép phá vỡ.
6. Ghi audit cho các hành động nghiệp vụ quan trọng.

Sau khi sửa:

1. Kiểm tra diff.
2. Xóa code thừa do chính task tạo ra.
3. Kiểm tra permission và scope.
4. Kiểm tra state transition.
5. Chạy test và build phù hợp.
6. Báo cáo theo cấu trúc quy định.

# 7. Điều cấm

Không được:

- tự cài Caveman hoặc Ponytail bản full;
- tự thêm dependency chỉ để rút ngắn code;
- xóa validation để giảm số dòng;
- bỏ test vì thay đổi “đơn giản”;
- sửa Authentication ngoài phạm vi;
- tự thay đổi công thức tính điểm;
- tự thay đổi vai trò;
- tự tạo thêm trạng thái BSC;
- cho phép sửa BSC đã nộp hoặc đã duyệt;
- tính điểm tin cậy ở frontend;
- tin role hoặc permission từ request body;
- tự động approve BSC;
- hard-code manager hoặc employee;
- bỏ qua audit cho hành động nhạy cảm;
- báo pass khi chưa chạy test;
- che giấu lỗi build, migration hoặc typecheck.

# 8. Nguyên tắc quyết định cuối cùng

Khi có nhiều cách triển khai, chọn phương án:

1. đúng rule nghiệp vụ nhất;
2. an toàn dữ liệu và quyền nhất;
3. nhất quán với codebase hiện tại nhất;
4. ít thay đổi nhất;
5. dễ kiểm thử nhất;
6. ít abstraction và dependency mới nhất.

Không chọn phương án chỉ vì nó có ít dòng code nhất.
