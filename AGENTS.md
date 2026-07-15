# BSC SYSTEM — BUSINESS AND DEVELOPMENT RULES

## 1. Mục tiêu hệ thống

Xây dựng hệ thống quản lý BSC/KPI theo tháng, phục vụ quy trình:

1. Nhân viên hoặc quản lý tự lập BSC cá nhân.
2. Người lập thêm KPO, KPI, chỉ tiêu, tỷ trọng và tần suất đo.
3. Người lập cập nhật kết quả thực hiện.
4. Hệ thống tính và hiển thị điểm.
5. Người lập nộp BSC cho cấp trên trực tiếp.
6. Cấp trên duyệt hoặc trả lại để chỉnh sửa.
7. BSC đã duyệt được dùng cho thống kê, đánh giá và hồ sơ bảng lương.

Hệ thống phải có quy trình trạng thái rõ ràng, phân quyền theo vai trò và phạm vi tổ chức, đồng thời lưu lịch sử thao tác.

---

## 2. Vai trò hệ thống

Hệ thống có bốn vai trò:

- ADMIN: Quản trị hệ thống.
- DIRECTOR: Giám đốc.
- MANAGER: Quản lý.
- EMPLOYEE: Nhân viên.

Không được hiểu quyền theo cách kế thừa đơn giản:

ADMIN > DIRECTOR > MANAGER > EMPLOYEE

ADMIN là vai trò quản trị kỹ thuật.

DIRECTOR, MANAGER và EMPLOYEE là vai trò nghiệp vụ.

Quyền phải được gán độc lập theo permission và phạm vi dữ liệu.

---

## 3. Đối tượng được có BSC cá nhân

Chỉ các vai trò sau có BSC cá nhân:

- MANAGER
- EMPLOYEE

Các vai trò sau không có BSC cá nhân:

- DIRECTOR
- ADMIN, trừ khi sau này có yêu cầu riêng.

Backend phải từ chối việc tạo BSC cá nhân cho DIRECTOR.

DIRECTOR không có:

- BSC cá nhân.
- Điểm BSC cá nhân.
- Xếp loại cá nhân.
- Chức năng tạo, duplicate, nhập kết quả hoặc nộp BSC cá nhân.

---

## 4. Quyền của ADMIN

ADMIN chịu trách nhiệm quản trị kỹ thuật.

ADMIN được phép:

- Quản lý tài khoản.
- Quản lý vai trò và quyền.
- Quản lý đơn vị, phòng ban.
- Thiết lập quan hệ quản lý trực tiếp.
- Quản lý kỳ BSC.
- Quản lý nhóm mục tiêu.
- Quản lý cấu hình tính điểm.
- Quản lý thang xếp loại.
- Quản lý giới hạn điểm phát sinh.
- Khóa hoặc mở kỳ hệ thống.
- Xem audit log.
- Hỗ trợ mở khóa dữ liệu trong trường hợp đặc biệt.

ADMIN không mặc định được:

- Lập BSC thay người dùng.
- Chấm điểm thay người dùng.
- Duyệt BSC thay quản lý hoặc giám đốc.
- Thay đổi âm thầm dữ liệu đã duyệt.
- Sửa dữ liệu bảng lương mà không có quy trình điều chỉnh.

Mọi thao tác đặc biệt của ADMIN phải có:

- Lý do.
- Người thực hiện.
- Thời gian.
- Giá trị trước.
- Giá trị sau.
- Audit log.

---

## 5. Quyền của DIRECTOR

DIRECTOR không có BSC cá nhân.

DIRECTOR được phép:

- Xem BSC trong phạm vi đơn vị phụ trách.
- Xem BSC của MANAGER và EMPLOYEE.
- Duyệt hoặc trả lại BSC của MANAGER.
- Duyệt BSC của EMPLOYEE khi nhân viên không có MANAGER trực tiếp.
- Xem danh sách chưa nộp.
- Xem danh sách chờ duyệt.
- Xem danh sách bị trả lại.
- Xem danh sách đã duyệt.
- Xem thống kê cá nhân, phòng ban và đơn vị.
- Xem lịch sử nộp, trả lại, duyệt và mở lại.
- Cho phép mở lại BSC đã duyệt trong phạm vi phụ trách.
- Xem biên bản họp đánh giá BSC.
- In và xuất báo cáo.
- Chốt hoặc xác nhận dữ liệu phục vụ bảng lương nếu được cấp quyền.

DIRECTOR không được:

- Tạo BSC cá nhân.
- Duplicate BSC cá nhân.
- Nhập kết quả BSC cá nhân.
- Duyệt ngoài phạm vi tổ chức.
- Duyệt BSC của chính mình.
- Sửa trực tiếp BSC đã nộp của người khác.
- Sửa dữ liệu đã duyệt mà không mở lại đúng quy trình.

---

## 6. Quyền của MANAGER

MANAGER có hai vai trò nghiệp vụ:

1. Tạo và nộp BSC cá nhân.
2. Duyệt BSC của EMPLOYEE trực thuộc.

MANAGER được phép đối với BSC cá nhân:

- Tạo BSC theo tháng.
- Duplicate BSC kỳ trước.
- Thêm KPO.
- Thêm KPI.
- Nhập chỉ tiêu.
- Nhập tỷ trọng.
- Nhập đơn vị tính.
- Nhập tần suất đo.
- Nhập kết quả thực hiện.
- Nhập thuyết minh.
- Đính kèm minh chứng nếu có.
- Lưu nháp.
- Xem điểm tạm tính.
- Nộp BSC cho DIRECTOR.
- Sửa khi bị trả lại.
- Nộp lại sau khi sửa.
- Yêu cầu mở lại BSC đã duyệt.

MANAGER được phép đối với nhân viên trực thuộc:

- Xem BSC.
- Xem kết quả từng KPI.
- Duyệt BSC.
- Trả lại BSC.
- Nhập lý do trả lại.
- Xem lịch sử các lần nộp.
- Cho phép mở lại nếu được cấp quyền.
- Xem thống kê phòng ban.

MANAGER không được:

- Duyệt BSC của chính mình.
- Duyệt BSC ngoài phạm vi.
- Sửa trực tiếp BSC của nhân viên sau khi nhân viên đã nộp.
- Thay đổi thang xếp loại toàn hệ thống.
- Sửa dữ liệu đã khóa cho bảng lương.

BSC của MANAGER được gửi cho DIRECTOR duyệt.

---

## 7. Quyền của EMPLOYEE

EMPLOYEE được phép:

- Tự tạo BSC theo tháng.
- Tạo mới hoặc duplicate từ BSC kỳ trước.
- Chọn nhóm mục tiêu.
- Thêm KPO.
- Thêm KPI.
- Nhập chỉ tiêu.
- Nhập tỷ trọng.
- Nhập đơn vị tính.
- Nhập tần suất đo.
- Nhập kết quả thực hiện.
- Nhập thuyết minh.
- Đính kèm minh chứng nếu có.
- Lưu nháp.
- Xem điểm tạm tính.
- Nộp BSC cho MANAGER trực tiếp.
- Sửa BSC khi bị trả lại.
- Nộp lại sau khi sửa.
- Gửi yêu cầu mở lại BSC đã duyệt.
- Xem lịch sử xử lý BSC cá nhân.
- In hoặc xuất BSC cá nhân nếu được cho phép.
- Xem thống kê cá nhân.

EMPLOYEE không được:

- Xem chi tiết BSC của người khác.
- Duyệt BSC.
- Sửa BSC sau khi đã nộp.
- Sửa BSC sau khi đã duyệt.
- Tự mở khóa BSC.
- Tự thay đổi điểm đã duyệt.
- Thay đổi cấu hình chấm điểm toàn hệ thống.

---

## 8. Flow duyệt BSC

## 8.1. BSC của EMPLOYEE

EMPLOYEE tạo BSC
→ Lưu nháp
→ Hoàn thiện định nghĩa KPI đủ 100% trọng số
→ Nộp PLAN
→ MANAGER duyệt hoặc trả lại PLAN
→ PLAN được duyệt
→ Nhập kết quả và TM KQTH
→ Xem điểm tạm tính
→ Nộp EVALUATION
→ MANAGER duyệt hoặc trả lại EVALUATION

MANAGER có hai lựa chọn:

- Duyệt.
- Trả lại để sửa.

Nếu trả lại:

MANAGER trả lại đúng stage
→ EMPLOYEE chỉ sửa nhóm trường được mở của stage đó
→ EMPLOYEE lưu
→ EMPLOYEE nộp lại đúng stage
→ MANAGER duyệt lại

Nếu EMPLOYEE không có MANAGER trực tiếp:

EMPLOYEE nộp từng stage
→ DIRECTOR phụ trách duyệt stage tương ứng

Không được để BSC ở trạng thái chờ duyệt mà không có người duyệt.

---

## 8.2. BSC của MANAGER

MANAGER tạo BSC
→ Lưu nháp
→ Nộp PLAN cho DIRECTOR
→ PLAN được duyệt
→ Nhập kết quả và TM KQTH
→ Nộp EVALUATION cho DIRECTOR
→ DIRECTOR xem xét từng stage

DIRECTOR có hai lựa chọn:

- Duyệt.
- Trả lại để sửa.

MANAGER không được tự duyệt BSC của mình.

---

## 9. Workflow BSC hai giai đoạn

Mỗi BSC có hai stage duyệt độc lập:

1. PLAN — duyệt nội dung/kế hoạch BSC.
2. EVALUATION — duyệt kết quả tự đánh giá sau khi nhập kết quả thực hiện.

Trạng thái PLAN gồm DRAFT, SUBMITTED, RETURNED, APPROVED. Trạng thái EVALUATION gồm NOT_STARTED, DRAFT, SUBMITTED, RETURNED, APPROVED.

- Submit PLAN không yêu cầu actual, điểm hoặc xếp loại.
- Approve PLAN khóa định nghĩa KPI và chuyển EVALUATION từ NOT_STARTED sang DRAFT; không ghi điểm cuối hoặc xếp loại.
- RETURN PLAN chỉ mở lại nhóm trường định nghĩa KPI.
- Chỉ khi PLAN đã APPROVED và EVALUATION đang DRAFT/RETURNED, chủ sở hữu mới được sửa actual và TM KQTH.
- RETURN EVALUATION chỉ mở lại actual, TM KQTH và nhóm trường kết quả; định nghĩa KPI vẫn khóa.
- Chỉ APPROVE EVALUATION mới ghi final score, final grade và khóa toàn bộ BSC.
- Không dùng một trạng thái APPROVED chung để biểu diễn cả hai stage.

Mọi approval step, review, status history, audit và pending-review phải chỉ rõ stage PLAN hoặc EVALUATION.

## 9.1. Quy tắc một-stage cũ — không còn canonical

Phần 9.1 đến 15 bên dưới chỉ mô tả workflow một-stage lịch sử và đã được thay thế bởi mục 9. Không dùng các trường `status`, `submitted_at`, `approved_at` cũ để quyết định transition mới. Mọi implementation mới phải dùng `plan_status` và `evaluation_status` độc lập cùng field-locking theo stage.

Các trạng thái bắt buộc:

- DRAFT
- SUBMITTED
- RETURNED
- APPROVED
- REOPENED

Tên hiển thị:

| Mã | Tên tiếng Việt |

|---|---|
| DRAFT | Nháp |
| SUBMITTED | Đã nộp / Chờ duyệt |
| RETURNED | Trả lại chỉnh sửa |
| APPROVED | Đã duyệt |
| REOPENED | Được mở lại |

Có thể bổ sung:

- PAYROLL_LOCKED: Đã khóa kỳ lương.

Chỉ bổ sung PAYROLL_LOCKED khi hệ thống có bước chốt dữ liệu riêng cho bảng lương.

---

## 10. Chuyển trạng thái one-stage lịch sử (đã thay thế)

Các chuyển trạng thái được phép:

DRAFT → SUBMITTED

SUBMITTED → APPROVED

SUBMITTED → RETURNED

RETURNED → SUBMITTED

APPROVED → REOPENED

REOPENED → SUBMITTED

Nếu có chốt kỳ lương:

APPROVED → PAYROLL_LOCKED

Các chuyển trạng thái không hợp lệ:

DRAFT → APPROVED

RETURNED → APPROVED

SUBMITTED → DRAFT

APPROVED → DRAFT

PAYROLL_LOCKED → DRAFT

Không được để frontend tự gửi trạng thái tùy ý.

Backend phải kiểm tra và quyết định mọi chuyển trạng thái.

---

## 11. Quy tắc nút Lưu one-stage lịch sử (đã thay thế)

Nút Lưu chỉ được sử dụng khi BSC đang ở một trong các trạng thái:

- DRAFT
- RETURNED
- REOPENED

Khi nhấn Lưu:

- Lưu dữ liệu đang nhập.
- Không gửi BSC cho cấp trên.
- Không khóa dữ liệu.
- Tính lại điểm.
- Hiển thị điểm tạm tính.
- Cập nhật thời gian chỉnh sửa.
- Ghi nhận người chỉnh sửa.

Sau khi Lưu, người dùng vẫn được sửa tiếp.

Lưu không đồng nghĩa với Nộp.

---

## 12. Quy tắc nút Nộp one-stage lịch sử (đã thay thế)

Nút Nộp chỉ xuất hiện khi trạng thái là:

- DRAFT
- RETURNED
- REOPENED

Trước khi nộp, hệ thống phải kiểm tra:

- Đã có ít nhất một KPI.
- Các trường bắt buộc đã đầy đủ.
- Chỉ tiêu hợp lệ.
- Tỷ trọng hợp lệ.
- Tổng tỷ trọng đúng quy định.
- Kết quả bắt buộc đã được nhập.
- Minh chứng bắt buộc đã được đính kèm.
- Kỳ BSC chưa bị khóa.
- Đã xác định được người duyệt.

Khi nhấn Nộp:

- Chuyển trạng thái sang SUBMITTED.
- Khóa quyền sửa của người nộp.
- Lưu thời gian nộp.
- Lưu người nộp.
- Xác định người duyệt.
- Gửi thông báo cho người duyệt.
- Tạo snapshot của dữ liệu tại thời điểm nộp.

Sau khi nộp, người dùng không được:

- Thêm KPI.
- Sửa KPI.
- Xóa KPI.
- Sửa chỉ tiêu.
- Sửa tỷ trọng.
- Sửa kết quả.
- Sửa thuyết minh.

---

## 13. Quy tắc duyệt one-stage lịch sử (đã thay thế)

Chỉ được duyệt BSC ở trạng thái SUBMITTED.

Khi duyệt:

- Chuyển trạng thái sang APPROVED.
- Lưu người duyệt.
- Lưu thời gian duyệt.
- Lưu điểm cuối cùng.
- Lưu xếp loại.
- Khóa dữ liệu.
- Tạo snapshot phiên bản đã duyệt.
- Gửi thông báo cho người nộp.

Không người dùng nào được tự duyệt BSC của chính mình.

Backend phải kiểm tra quy tắc này, không chỉ ẩn nút ở frontend.

---

## 14. Quy tắc trả lại one-stage lịch sử (đã thay thế)

Chỉ được trả lại BSC đang ở trạng thái SUBMITTED.

Khi trả lại:

- Bắt buộc nhập lý do.
- Chuyển trạng thái sang RETURNED.
- Lưu người trả lại.
- Lưu thời gian trả lại.
- Mở quyền sửa cho chủ sở hữu BSC.
- Gửi thông báo cho chủ sở hữu.
- Không xóa dữ liệu của lần nộp trước.

Nên cho phép người duyệt chỉ rõ:

- KPI cần sửa.
- Nội dung cần sửa.
- Ghi chú hướng dẫn.

---

## 15. Quy tắc reopen lịch sử (ngoài phạm vi phase hiện tại)

Người lập không được tự sửa BSC đã nộp hoặc đã duyệt.

Muốn sửa phải:

1. Gửi yêu cầu cho cấp trên.
2. Nêu lý do cần sửa.
3. Cấp trên chấp thuận mở lại hoặc trả lại.
4. BSC chuyển sang REOPENED hoặc RETURNED.
5. Người lập chỉnh sửa.
6. Người lập nộp lại.
7. Cấp trên duyệt lại.

Khi mở lại BSC đã duyệt, hệ thống phải lưu:

- Người yêu cầu.
- Người chấp thuận.
- Lý do.
- Thời gian.
- Phiên bản trước khi mở lại.
- Nội dung thay đổi sau khi mở lại.

BSC mở lại không được giữ nguyên trạng thái APPROVED.

---

## 16. Cấu trúc BSC

Mỗi BSC phải có:

- ID.
- Chủ sở hữu.
- Vai trò chủ sở hữu.
- Đơn vị.
- Người duyệt.
- Tháng.
- Năm.
- Trạng thái.
- Điểm tổng.
- Điểm phát sinh.
- Điểm cuối cùng.
- Xếp loại.
- Ngày tạo.
- Ngày cập nhật.
- Ngày nộp.
- Ngày duyệt.
- Người duyệt.
- Nguồn duplicate nếu có.

Mỗi người chỉ được có một BSC chính thức trong một kỳ tháng, trừ khi hệ thống hỗ trợ nhiều loại BSC riêng biệt.

---

## 17. Nhóm mục tiêu

Hệ thống hỗ trợ các nhóm mục tiêu:

- Mục tiêu chung.
- Mục tiêu chuyên môn của đơn vị.
- Nhóm mục tiêu quan trọng và cấp bách.
- Nhóm mục tiêu quan trọng hoặc cấp bách.
- Nhóm mục tiêu thường xuyên.

Các nhóm mục tiêu phải được lưu dưới dạng cấu hình hoặc dữ liệu database.

Không hard-code hoàn toàn vào frontend.

Mỗi nhóm có thể chứa nhiều KPI.

Tỷ trọng nhóm nên được tính bằng tổng tỷ trọng các KPI thuộc nhóm.

Không nên nhập đồng thời:

- Tỷ trọng nhóm thủ công.
- Tổng tỷ trọng KPI tự động.

Việc lưu hai giá trị có thể gây lệch dữ liệu.

---

## 18. Cấu trúc KPI

Mỗi KPI phải có tối thiểu:

- Nhóm mục tiêu.
- Mục tiêu chiến lược/KPO.
- Nội dung đo lường/KPI.
- Đơn vị tính.
- Chỉ tiêu.
- Tỷ trọng.
- Tần suất đo.
- Kết quả thực hiện.
- Loại công thức tính điểm.
- Người tạo.
- Ngày tạo.

Có thể bổ sung:

- Mã KPI.
- Mô tả.
- Hướng dẫn nhập.
- Ngưỡng tối thiểu.
- Điểm tối đa.
- Yêu cầu minh chứng.
- File minh chứng.
- Nguồn dữ liệu.
- Ghi chú.
- Số lần vi phạm hoặc nhắc nhở.

---

## 19. Quy tắc tỷ trọng

Tổng tỷ trọng của toàn bộ KPI trong BSC phải bằng 100%.

Không cho phép nộp nếu:

- Tổng tỷ trọng nhỏ hơn 100%.
- Tổng tỷ trọng lớn hơn 100%.
- Có tỷ trọng âm.
- Có KPI không có tỷ trọng.
- Có dữ liệu tỷ trọng không hợp lệ.

Hệ thống phải hiển thị tổng tỷ trọng theo thời gian thực.

Nếu có KPI không tính vào điểm, tỷ trọng có thể bằng 0%, nhưng phải có lý do hoặc loại KPI phù hợp.

---

## 20. Duplicate BSC

MANAGER và EMPLOYEE được phép duplicate BSC của chính mình từ kỳ trước.

Khi duplicate, được sao chép:

- Nhóm mục tiêu.
- KPO.
- KPI.
- Đơn vị tính.
- Chỉ tiêu.
- Tỷ trọng.
- Tần suất đo.
- Cấu hình cách tính điểm.

Không được sao chép:

- Kết quả thực tế.
- Điểm KPI.
- Điểm tổng.
- Điểm phát sinh.
- Xếp loại.
- Trạng thái duyệt.
- Người duyệt.
- Thời gian duyệt.
- Nhận xét kết quả.
- Minh chứng cũ.
- Biên bản cũ.
- Lịch sử phê duyệt cũ.

Bản duplicate phải:

- Thuộc kỳ mới.
- Có trạng thái DRAFT.
- Ghi nhận BSC nguồn.
- Ghi người duplicate.
- Ghi thời gian duplicate.
- Không tạo trùng kỳ đã tồn tại.

Duplicate chỉ giúp kế thừa cấu trúc. Người dùng vẫn phải rà soát và xác nhận lại nội dung của kỳ mới.

---

## 21. Tính điểm KPI

Không hard-code một công thức duy nhất cho mọi KPI.

Mỗi KPI phải có loại tính điểm.

## 21.1. KPI càng cao càng tốt

Ví dụ:

- Số lượng tuyển sinh.
- Doanh thu.
- Số lượng dữ liệu.
- Tỷ lệ hoàn thành.

Công thức mặc định:

rawAchievementPercentage = actualValue / targetValue × 100

Ví dụ:

- Chỉ tiêu: 550.
- Kết quả: 495.
- Tỷ trọng: 10%.

rawAchievementPercentage = 495 / 550 × 100 = 90

---

## 21.2. KPI càng thấp càng tốt

Ví dụ:

- Chi phí.
- Thời gian xử lý.
- Tỷ lệ lỗi.
- Số lần vi phạm.

Công thức mặc định:

rawAchievementPercentage = targetValue / actualValue × 100

Phải xử lý trường hợp actualValue bằng 0.

Không được để lỗi chia cho 0.

---

## 21.3. KPI đạt hoặc không đạt

Nếu đạt:

kpiScore = weight

Nếu không đạt:

kpiScore = 0

Có thể cấu hình mức trừ điểm khi vi phạm.

Ví dụ:

- Hoàn thành đúng yêu cầu: 100%.
- Mỗi lần bị nhắc nhở: giảm 20%.

Công thức:

completionRate = max(0, 100% - warningCount × 20%)

kpiScore = completionRate × weight

---

## 21.4. KPI có ngưỡng tối thiểu

Ví dụ:

- Từ 70% trở lên: tính theo tỷ lệ hoàn thành thực tế.
- Dưới 70%: không đạt.

Công thức:

Nếu completionRate < minimumThreshold:

kpiScore = 0

Nếu completionRate >= minimumThreshold:

kpiScore = completionRate × weight

Ngưỡng 70% phải được cấu hình theo KPI.

Không hard-code 70% cho toàn hệ thống.

---

## 21.5. Alignment và làm tròn điểm (Phase 3B.4)

Tỷ lệ hoàn thành và điểm công việc là hai domain value riêng:

- `roundedAchievementPercentage = HALF_UP(rawAchievementPercentage, 0)`.
- `rawWorkScore` do công thức điểm công việc tạo ra; công thức canonical hiện tại giữ giá trị raw achievement, không lấy từ achievement đã làm tròn.
- `roundedWorkScore = HALF_UP(rawWorkScore / 10, 0) × 10`.
- `weightedScore = roundedWorkScore × weight / 100`.
- `totalWeightedScore` là tổng Decimal chính xác của các `weightedScore`.
- Xếp loại dùng `totalWeightedScore` chính xác và chỉ được tạo khi tổng trọng số bằng 100, mọi KPI có actual và đều tính được.

Hai phép làm tròn phải độc lập. Không được dùng `roundedAchievementPercentage` để tạo `rawWorkScore` hoặc `roundedWorkScore`. Domain scoring dùng `Prisma.Decimal`; chỉ giá trị transport mới được làm tròn HALF_UP tối đa 4 chữ số thập phân.

Trong dual-stage workflow, PLAN không yêu cầu actual và không ghi điểm. EVALUATION submit kiểm tra scoring hoàn chỉnh; EVALUATION approve đọc dữ liệu mới nhất, tính lại trong transaction rồi mới ghi `manager_total_score`, `final_score` và `final_grade`.

Các tổng điểm chính thức và score snapshot của review dùng `Decimal(18,4)` để giá trị lưu khớp với Decimal canonical dùng cho xếp loại; migration chỉ nới precision, không tự tính lại dữ liệu đã duyệt.

Chưa xác nhận công thức điểm công việc nào khác ngoài công thức canonical hiện hữu. Không tự thêm cap, ngưỡng dưới 70%, bảng quy đổi hoặc adjustment ±10 vào pipeline Phase 3B.4.

---

## 22. Điểm tổng BSC

Điểm tổng KPI:

totalKpiScore = tổng điểm của tất cả KPI

Điểm cuối cùng:

finalScore = totalKpiScore + adjustmentScore

Trong đó adjustmentScore là điểm phát sinh trong kỳ.

Điểm phát sinh phải nằm trong khoảng:

-10% đến +10%

Ví dụ:

- Tổng KPI: 102%.
- Điểm phát sinh: +5%.
- Điểm cuối cùng: 107%.

Hoặc:

- Tổng KPI: 95%.
- Điểm phát sinh: -3%.
- Điểm cuối cùng: 92%.

---

## 23. Quy tắc điểm phát sinh ±10%

Điểm phát sinh không được nhập tùy ý mà phải có:

- Giá trị cộng hoặc trừ.
- Lý do.
- Người đề xuất.
- Người xác nhận.
- Thời gian.
- Audit log.

Không cho phép giá trị nhỏ hơn -10% hoặc lớn hơn +10%.

Cần phân quyền riêng cho thao tác nhập hoặc duyệt điểm phát sinh.

Nhân viên không mặc định được tự cộng điểm phát sinh cho mình.

---

## 24. Xếp loại BSC

Thang xếp loại chính thức:

| Điểm cuối cùng | Xếp loại |

|---:|---|
| Dưới 80% | C |
| Từ 80% đến dưới 90% | B |
| Từ 90% đến 100% | A |
| Trên 100% đến dưới 111% | A+ |
| Từ 111% trở lên | A++ |

Quy tắc code:

score < 80
→ C

80 <= score < 90
→ B

90 <= score <= 100
→ A

100 < score < 111
→ A+

score >= 111
→ A++

Dùng khoảng `100 < score < 111` cho A+ để không bị bỏ trống các điểm như:

- 110.1%
- 110.5%
- 110.99%

---

## 25. Làm tròn điểm

Khuyến nghị:

- Điểm KPI lưu tối thiểu 4 chữ số thập phân.
- Điểm tổng hiển thị 2 chữ số thập phân.
- Xếp loại dựa trên điểm cuối cùng đã làm tròn 2 chữ số thập phân.

Ví dụ:

finalScore = round(totalKpiScore + adjustmentScore, 2)

classification = classify(finalScore)

Frontend và backend không được dùng hai quy tắc làm tròn khác nhau.

Backend là nguồn dữ liệu chuẩn cho điểm và xếp loại.

---

## 26. Biên bản họp đánh giá BSC

Hệ thống có chức năng lập biên bản họp đánh giá theo tháng.

Biên bản có thể gồm:

- Số biên bản.
- Tháng, năm.
- Đơn vị.
- Thời gian bắt đầu.
- Thời gian kết thúc.
- Địa điểm.
- Chủ trì.
- Thư ký.
- Thành viên vắng.
- Lý do vắng.
- Danh sách người được đánh giá.
- Điểm tự đánh giá.
- Xếp loại tự đánh giá.
- Điểm đơn vị đánh giá.
- Xếp loại đơn vị đánh giá.
- Thuyết minh.
- Kết luận.

Biên bản phải liên kết đúng:

- Đơn vị.
- Kỳ BSC.
- Danh sách BSC liên quan.

Không được liên kết BSC của tháng khác hoặc đơn vị khác.

Thứ tự chính xác giữa duyệt BSC và lập biên bản vẫn phải cấu hình được, không hard-code nếu chưa được xác nhận đầy đủ.

---

## 27. Thống kê

Hệ thống phải hỗ trợ:

- Thống kê cá nhân.
- Thống kê phòng ban.
- Thống kê đơn vị.
- Lọc theo tháng.
- Lọc theo năm.
- Lọc theo trạng thái.
- Lọc theo xếp loại.
- So sánh nhiều kỳ.
- Biểu đồ điểm.
- Danh sách chưa nộp.
- Danh sách chờ duyệt.
- Danh sách bị trả lại.
- Danh sách đã duyệt.
- Xuất Excel.
- In báo cáo.

EMPLOYEE chỉ xem thống kê cá nhân.

MANAGER xem thống kê phòng ban trực thuộc.

DIRECTOR xem thống kê trong phạm vi phụ trách.

ADMIN chỉ xem dữ liệu nghiệp vụ khi có permission phù hợp.

---

## 28. Liên kết bảng lương

BSC đã duyệt được sử dụng làm căn cứ cho hồ sơ hoặc bảng lương.

Chỉ BSC ở trạng thái APPROVED hoặc PAYROLL_LOCKED mới được đưa vào dữ liệu lương.

Không sử dụng BSC ở các trạng thái:

- DRAFT
- SUBMITTED
- RETURNED
- REOPENED

Hệ thống phải lưu snapshot điểm BSC được sử dụng tại thời điểm chốt lương.

Nếu BSC bị sửa sau khi đã chốt lương:

- Không tự ghi đè dữ liệu lương cũ.
- Phải tạo phiên điều chỉnh.
- Phải ghi lý do.
- Phải được phê duyệt lại.
- Phải lưu audit log.

Điểm BSC không mặc định bằng trực tiếp tỷ lệ lương.

Công thức quy đổi BSC sang tiền lương hoặc hệ số lương phải là cấu hình riêng.

---

## 29. Audit log

Các thao tác bắt buộc ghi audit log:

- Tạo BSC.
- Duplicate BSC.
- Thêm KPI.
- Sửa KPI.
- Xóa KPI.
- Thay đổi chỉ tiêu.
- Thay đổi tỷ trọng.
- Thay đổi công thức.
- Nhập kết quả.
- Lưu.
- Nộp.
- Trả lại.
- Duyệt.
- Mở lại.
- Khóa kỳ.
- Mở khóa kỳ.
- Thay đổi điểm phát sinh.
- Thay đổi điểm cuối cùng.
- Xuất dữ liệu lương.

Mỗi audit log gồm:

- Người thao tác.
- Vai trò.
- Thời gian.
- Hành động.
- Đối tượng.
- Giá trị trước.
- Giá trị sau.
- Lý do.
- Phạm vi đơn vị.
- IP hoặc thông tin thiết bị nếu hệ thống hỗ trợ.

Không được xóa audit log thông qua giao diện thông thường.

---

## 30. Permission gợi ý

## Quản trị hệ thống

user.view
user.create
user.update
user.lock
user.password.reset
department.view
department.manage
position.view
position.manage
role.view
role.manage
permission.view
permission.assign
bsc.period.view
bsc.period.manage
bsc.template.view
bsc.template.manage
audit.view

## BSC cá nhân

bsc.create.own
bsc.view.own
bsc.edit.own
bsc.delete.own
bsc.duplicate.own
bsc.submit.own
bsc.reopen.request

## Duyệt cấp dưới

bsc.view.subordinate
bsc.approve.subordinate
bsc.return.subordinate
bsc.reopen.subordinate

## Giám sát đơn vị

bsc.view.unit
bsc.view.organization
bsc.statistics.unit
bsc.statistics.organization

## Biên bản và bảng lương

bsc.minutes.create
bsc.minutes.view
bsc.minutes.approve
bsc.payroll.lock
bsc.payroll.export

## Audit và mở khóa

bsc.audit.view
bsc.unlock.approved
bsc.unlock.payroll

DIRECTOR không được gán mặc định:

bsc.create.own
bsc.edit.own
bsc.duplicate.own
bsc.submit.own

---

## 31. Kiểm tra quyền và phạm vi dữ liệu

Không chỉ kiểm tra role.

Mỗi API phải kiểm tra đồng thời:

1. Permission.
2. Phạm vi tổ chức.
3. Quan hệ sở hữu.
4. Quan hệ quản lý trực tiếp.
5. Trạng thái BSC.

Ví dụ MANAGER duyệt BSC:

- Có permission bsc.approve.subordinate.
- BSC thuộc EMPLOYEE trực thuộc.
- MANAGER thuộc đúng đơn vị hoặc phạm vi.
- BSC đang ở trạng thái SUBMITTED.
- MANAGER không phải chủ sở hữu BSC.

Không được chỉ kiểm tra:

user.role === "MANAGER"

---

## 32. Quy tắc frontend

Frontend phải hiển thị nút theo trạng thái và quyền.

## DRAFT

Hiển thị:

- Thêm KPI.
- Sửa.
- Xóa.
- Lưu.
- Nộp.
- Duplicate nếu phù hợp.

## SUBMITTED

Chủ sở hữu chỉ được:

- Xem.
- In.
- Theo dõi trạng thái.

Không hiển thị:

- Lưu.
- Sửa.
- Xóa.
- Nộp.

Người duyệt được thấy:

- Duyệt.
- Trả lại.

## RETURNED

Chủ sở hữu được:

- Xem lý do trả lại.
- Sửa.
- Lưu.
- Nộp lại.

## APPROVED

Chủ sở hữu được:

- Xem.
- In.
- Xuất.
- Gửi yêu cầu mở lại.

Không được sửa trực tiếp.

## REOPENED

Chủ sở hữu được:

- Sửa.
- Lưu.
- Nộp lại.

Việc ẩn nút ở frontend không thay thế kiểm tra quyền ở backend.

---

## 33. Quy tắc kỹ thuật cho Codex

1. Backend là nguồn dữ liệu chuẩn.
2. Không tin trạng thái do frontend gửi.
3. Không tin điểm cuối cùng do frontend tự tính.
4. Backend phải tính lại điểm khi lưu hoặc nộp.
5. Không hard-code quyền theo tên role ở nhiều nơi.
6. Dùng permission kết hợp data scope.
7. Không cho DIRECTOR có BSC cá nhân.
8. Không cho người dùng tự duyệt BSC của mình.
9. Mọi thay đổi trạng thái phải chạy trong transaction.
10. Mọi thao tác duyệt, trả lại, mở lại và khóa phải có audit log.
11. Dữ liệu đã nộp phải có snapshot.
12. Dữ liệu đã duyệt phải có snapshot.
13. Dữ liệu dùng cho bảng lương phải có snapshot riêng.
14. Không sửa trực tiếp bản ghi đã duyệt.
15. Không xóa cứng BSC đã từng nộp hoặc duyệt.
16. Dùng soft delete hoặc trạng thái hủy.
17. Không hard-code công thức KPI duy nhất.
18. Không hard-code thang xếp loại trong frontend.
19. Frontend và backend phải dùng cùng quy tắc làm tròn.
20. Rich text phải được sanitize trước khi lưu hoặc hiển thị.
21. Mọi API phải có authentication.
22. Mọi API phải có authorization.
23. Mọi API phải kiểm tra phạm vi tổ chức.
24. Mọi thao tác duplicate phải kiểm tra kỳ đích.
25. Không tạo hai BSC chính thức cho cùng người trong cùng kỳ.

---

## 34. Integration test bắt buộc

## EMPLOYEE

- Tạo được BSC cá nhân.
- Duplicate được BSC kỳ trước.
- Thêm được KPO và KPI.
- Lưu được BSC nháp.
- Xem được điểm sau khi lưu.
- Nộp được BSC hợp lệ.
- Không sửa được sau khi nộp.
- Sửa được khi bị trả lại.
- Không duyệt được BSC.
- Không xem được BSC người khác.
- Không tự mở lại BSC đã duyệt.

## MANAGER

- Tạo được BSC cá nhân.
- Nộp BSC lên DIRECTOR.
- Không tự duyệt BSC cá nhân.
- Xem được BSC nhân viên trực thuộc.
- Không xem được nhân viên ngoài phạm vi.
- Duyệt được BSC SUBMITTED của nhân viên.
- Trả lại được BSC và bắt buộc nhập lý do.
- Không duyệt được BSC DRAFT.
- Không duyệt được BSC RETURNED chưa nộp lại.

## DIRECTOR

- Không tạo được BSC cá nhân.
- Không duplicate được BSC cá nhân.
- Không có điểm BSC cá nhân.
- Xem được BSC trong phạm vi.
- Duyệt được BSC MANAGER.
- Không duyệt ngoài phạm vi.
- Duyệt được EMPLOYEE khi không có MANAGER trực tiếp.
- Mở lại được BSC đã duyệt khi có quyền.

## Duplicate

- Sao chép cấu trúc mục tiêu.
- Sao chép KPI.
- Sao chép chỉ tiêu và tỷ trọng.
- Không sao chép kết quả.
- Không sao chép điểm.
- Không sao chép xếp loại.
- Không sao chép trạng thái duyệt.
- Không sao chép minh chứng.
- Bản mới ở trạng thái DRAFT.
- Không tạo trùng kỳ.

## Tính điểm

- KPI càng cao càng tốt.
- KPI càng thấp càng tốt.
- KPI đạt hoặc không đạt.
- KPI có ngưỡng tối thiểu.
- Xử lý actualValue bằng 0.
- Xử lý điểm vượt 100%.
- Xử lý điểm phát sinh từ -10% đến +10%.
- Từ chối điểm phát sinh ngoài giới hạn.
- Xếp loại C, B, A, A+, A++ đúng ranh giới.
- Kiểm tra các điểm 79.99, 80, 89.99, 90, 100, 100.01, 110.99 và 111.

## Bảo mật

- EMPLOYEE không sửa được BSC người khác.
- EMPLOYEE không gọi được API duyệt.
- MANAGER không duyệt ngoài phạm vi.
- Không thể giả trạng thái bằng request.
- Không thể sửa bản APPROVED.
- Không thể tự duyệt.
- DIRECTOR không thể tạo BSC cá nhân.
- Mở lại BSC phải có audit log.

---

## 35. Những nội dung chưa được xác nhận hoàn toàn

Không tự hard-code các nội dung sau cho đến khi có xác nhận:

1. Cấp trên có được điều chỉnh trực tiếp điểm hay chỉ duyệt/trả lại.
2. Điểm phát sinh ±10% do vai trò nào đề xuất và vai trò nào phê duyệt.
3. Biên bản họp được lập trước hay sau bước duyệt.
4. BSC được chuyển tự động sang phần mềm lương hay chỉ in/xuất thủ công.
5. Công thức quy đổi điểm BSC sang tiền lương.
6. Có trạng thái PAYROLL_LOCKED riêng hay không.
7. Trình soạn thảo rich text có được giữ nguyên trong hệ thống mới hay chuyển sang dữ liệu có cấu trúc.
8. Có cho phép sửa chỉ một KPI hay mở lại toàn bộ BSC.
9. Kỳ BSC có deadline riêng cho PLAN và EVALUATION hay không. Cho đến khi xác nhận, `submission_deadline` legacy chỉ áp dụng cho nộp EVALUATION; PLAN chỉ yêu cầu kỳ đang OPEN.
10. Measurement unit và frequency có bắt buộc theo loại KPI nào hay không. Không từ chối submit chỉ vì thiếu hai trường này cho đến khi có cấu hình canonical; schema hiện chưa có frequency.

Khi gặp những nội dung chưa xác nhận, Codex phải:

- Đánh dấu là open question.
- Không tự đặt quy tắc ảnh hưởng dữ liệu.
- Đề xuất phương án.
- Không triển khai cố định khi chưa có xác nhận.

---

## 36. Thứ tự triển khai đề xuất

## Phase 1 — Nền tảng

- Người dùng.
- Vai trò.
- Permission.
- Đơn vị.
- Quan hệ MANAGER–EMPLOYEE.
- Phạm vi DIRECTOR.
- Kỳ BSC.

## Phase 2 — BSC cá nhân

- Tạo BSC.
- Nhóm mục tiêu.
- KPO.
- KPI.
- Chỉ tiêu.
- Tỷ trọng.
- Tần suất đo.
- Duplicate.

## Phase 3 — Kết quả và tính điểm

- Nhập kết quả.
- Công thức KPI.
- Lưu.
- Tính điểm.
- Điểm phát sinh.
- Xếp loại.

## Phase 4 — Phê duyệt

- Nộp.
- Khóa chỉnh sửa.
- Danh sách chờ duyệt.
- Duyệt.
- Trả lại.
- Nộp lại.
- Thông báo.

## Phase 5 — Kiểm soát

- Snapshot.
- Audit log.
- Yêu cầu mở lại.
- Duyệt mở lại.
- Khóa kỳ.

## Phase 6 — Báo cáo

- Thống kê cá nhân.
- Thống kê phòng ban.
- Thống kê đơn vị.
- Biểu đồ.
- Excel.
- In báo cáo.

## Phase 7 — Biên bản và bảng lương

- Biên bản họp.
- Chốt điểm.
- Snapshot dữ liệu lương.
- Xuất hoặc tích hợp bảng lương.
