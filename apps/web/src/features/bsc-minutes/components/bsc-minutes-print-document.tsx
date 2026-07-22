import React from 'react';

export type MinutesPrintRow = {
  id: string;
  employeeName: string;
  selfScore: string | null;
  selfGrade: string | null;
  unitScore: string;
  unitGrade: string;
  explanation: string;
};

export type MinutesPrintCollectiveRow = {
  id: string;
  departmentName: string;
  selfScore: string;
  selfGrade: string;
  unitScore: string;
  unitGrade: string;
  explanation: string;
};

export type MinutesPrintDocumentProps = {
  number: string;
  issuePlace: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  chairName: string;
  secretaryName: string;
  absentCount: string;
  subject: string;
  meetingContent: string;
  nextMonthAssignment: string;
  conclusion: string;
  collectiveRows: MinutesPrintCollectiveRow[];
  rows: MinutesPrintRow[];
};

const longDate = (value: string, place: string) => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return place;
  return `${place}, ngày ${Number(day)} tháng ${Number(month)} năm ${year}`;
};

const longTime = (value: string) => {
  const [hour, minute] = value.split(':');
  if (!hour || minute === undefined) return value;
  return `${Number(hour)} giờ ${Number(minute)} phút`;
};

const shortDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '…/…/……';
};

const valueOrBlank = (value: string | null) => value || '';

export const BscMinutesPrintDocument: React.FC<MinutesPrintDocumentProps> = (props) => (
  <article className="minutes-print-document" aria-label="Bản in biên bản đánh giá BSC">
    <header className="minutes-print-header">
      <div className="minutes-print-organization">
        <strong className="minutes-print-heading-line">CÔNG TY TNHH MTV CÔNG NGHỆ FEDX</strong>
        <span>Số: {props.number || '…'} / BB-FEDX</span>
      </div>
      <div className="minutes-print-national-heading">
        <strong className="minutes-print-heading-line">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
        <strong className="minutes-print-heading-line">Độc lập - Tự do - Hạnh phúc</strong>
        <em>{longDate(props.date, props.issuePlace || '……')}</em>
      </div>
    </header>

    <div className="minutes-print-title">
      <h1>BIÊN BẢN</h1>
      <p><span className="minutes-print-subject">{props.subject}</span></p>
    </div>

    <section>
      <h2>I. Thời gian, địa điểm:</h2>
      <p>- Vào lúc {longTime(props.startTime)} ngày {shortDate(props.date)}</p>
      <p>- Tại {props.location || '…………………………………………'}</p>
    </section>

    <section>
      <h2>II. Thành phần:</h2>
      <p>1. <strong><em>Ông/bà: {props.chairName || '………………………………'}</em></strong><span className="minutes-print-role">- Chủ trì;</span></p>
      <p>2. <strong><em>Ông/bà: {props.secretaryName || '………………………………'}</em></strong><span className="minutes-print-role">- Thư ký;</span></p>
      <p>Cùng với các viên chức, người lao động đang công tác tại đơn vị.</p>
      <p>Vắng: {props.absentCount || '0'}</p>
    </section>

    <section>
      <h2>III. Nội dung: <span>{props.meetingContent}</span></h2>
      <h3>1. Kết quả đánh giá</h3>
      <table className="minutes-print-table">
        <colgroup>
          <col className="minutes-print-column-index" />
          <col className="minutes-print-column-name" />
          <col className="minutes-print-column-score" />
          <col className="minutes-print-column-grade" />
          <col className="minutes-print-column-score" />
          <col className="minutes-print-column-grade" />
          <col className="minutes-print-column-explanation" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>TT</th>
            <th rowSpan={2}>Họ và tên</th>
            <th colSpan={2}>Tự đánh giá</th>
            <th colSpan={2}>Đơn vị đánh giá</th>
            <th rowSpan={2}>Thuyết minh (nếu tăng hoặc hạ bậc xếp loại)</th>
          </tr>
          <tr><th>Điểm</th><th>Xếp loại</th><th>Điểm</th><th>Xếp loại</th></tr>
        </thead>
        <tbody>
          <tr className="minutes-print-group"><th>A</th><th colSpan={5}>Cá nhân</th><td /></tr>
          {props.rows.map((row, index) => <tr key={row.id}>
            <td>{index + 1}</td><td>{row.employeeName}</td><td>{valueOrBlank(row.selfScore)}</td>
            <td>{valueOrBlank(row.selfGrade)}</td><td>{row.unitScore}</td><td>{row.unitGrade}</td><td>{row.explanation}</td>
          </tr>)}
          <tr className="minutes-print-group"><th>B</th><th colSpan={5}>Tập thể</th><td /></tr>
          {props.collectiveRows.map((row, index) => <tr key={row.id}>
            <td>{`B.${index + 1}`}</td><td>{row.departmentName}</td><td>{row.selfScore}</td><td>{row.selfGrade}</td>
            <td>{row.unitScore}</td><td>{row.unitGrade}</td><td>{row.explanation}</td>
          </tr>)}
        </tbody>
      </table>
      <h3>2. Giao chỉ tiêu tháng tới: <span>{props.nextMonthAssignment}</span></h3>
    </section>

    <section>
      <h2>IV. Kết luận:</h2>
      <div className="minutes-print-multiline">{props.conclusion || '- Nội dung Biên bản đã được thông qua và các thành viên dự họp thống nhất.'}</div>
      <p>Cuộc họp kết thúc lúc {longTime(props.endTime)} cùng ngày./.</p>
    </section>
  </article>
);
